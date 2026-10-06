import supabaseAdmin from '../../../config/supabaseAdmin.js'
import { listarDatasFeriadosAtivos } from '../../calendario/services/calendario.service.js'
import {
    registrarAuditoria,
    registrarOcorrencia
} from '../../historico_pacientes/services/auditoria.service.js'
import {
    getBrasiliaDate,
    isDeadlineOverdue,
    STATUS_PRAZO,
    toDateOnly
} from './prazo.utils.js'
import {
    AUTOMACAO_JOB,
    executarComLease,
    registrarInconsistencia,
    registrarItemExecucao
} from '../../operacao/services/automacao.service.js'

export const ACTIVE_ORDER_STATUSES = Object.freeze(['enviada', 'em_entrega'])
export const OVERDUE_EVENT_TYPE = 'PRAZO_ATRASO_ATINGIDO'

const ORDER_SELECT = `
    id,
    numero,
    paciente_id,
    status,
    data_previsao_entrega,
    prazo_ciclo,
    status_prazo,
    fornecedores:fornecedor_id (
        id
    ),
    cotacoes:cotacao_id (
        id
    ),
    ordem_fornecimento_responsaveis (
        usuario_id
    )
`

function responsavelIds(ordem) {
    return (ordem.ordem_fornecimento_responsaveis || [])
        .map((item) => item.usuario_id)
        .filter(Boolean)
        .sort()
}

export function isEligibleForOverdue(ordem) {
    return ACTIVE_ORDER_STATUSES.includes(ordem?.status)
        && Boolean(toDateOnly(ordem?.data_previsao_entrega))
}

export const isEligibleOrder = isEligibleForOverdue

function idempotencyKey(ordem) {
    return `of:${ordem.id}:ciclo:${Number(ordem.prazo_ciclo || 1)}:atraso`
}

async function auditarInconsistencias(ordem, logger) {
    const inconsistencias = []
    const dependencias = [
        ['FORNECEDOR_AUSENTE', !ordem?.fornecedor_id || !ordem?.fornecedores],
        ['COTACAO_AUSENTE', !ordem?.cotacao_id || !ordem?.cotacoes],
        ['PACIENTE_AUSENTE', !ordem?.paciente_id],
        ['GESTORES_RESPONSAVEIS_AUSENTES', !(ordem?.ordem_fornecimento_responsaveis || []).some((item) => item?.usuario_id)]
    ]

    for (const [tipo, ausente] of dependencias) {
        if (!ausente) continue
        inconsistencias.push(tipo)
        await registrarInconsistencia({
            ordem,
            tipo,
            descricao: `A ordem possui a dependencia operacional ausente: ${tipo}.`,
            dados: { ordem_numero: ordem.numero },
            logger
        })
    }

    return inconsistencias
}

async function buscarOrdemAtual(id) {
    return await supabaseAdmin
        .from('ordens_fornecimento')
        .select(ORDER_SELECT)
        .eq('id', id)
        .maybeSingle()
}

async function atualizarStatusCondicionalmente(ordem) {
    if (ordem.status_prazo === STATUS_PRAZO.ATRASADA) {
        return { data: ordem, error: null, transicionada: false }
    }

    const atualizacao = await supabaseAdmin
        .from('ordens_fornecimento')
        .update({
            status_prazo: STATUS_PRAZO.ATRASADA,
            prazo_atualizado_em: new Date().toISOString(),
            atualizado_por: null
        })
        .eq('id', ordem.id)
        .in('status', ACTIVE_ORDER_STATUSES)
        .eq('data_previsao_entrega', toDateOnly(ordem.data_previsao_entrega))
        .eq('prazo_ciclo', Number(ordem.prazo_ciclo || 1))
        .neq('status_prazo', STATUS_PRAZO.ATRASADA)
        .select(ORDER_SELECT)
        .maybeSingle()

    return {
        ...atualizacao,
        transicionada: Boolean(atualizacao.data)
    }
}

export async function registrarEventoDeAtraso(ordem, hoje) {
    const ciclo = Number(ordem.prazo_ciclo || 1)
    const dataLimite = toDateOnly(ordem.data_previsao_entrega)
    const key = idempotencyKey(ordem)
    const responsaveis = responsavelIds(ordem)

    const historico = await supabaseAdmin
        .from('ordem_fornecimento_prazo_historico')
        .upsert([{
            ordem_fornecimento_id: ordem.id,
            ciclo,
            data_limite: dataLimite,
            status_prazo: STATUS_PRAZO.ATRASADA,
            tipo_evento: OVERDUE_EVENT_TYPE,
            responsavel_ids: responsaveis,
            usuario_id: null,
            idempotency_key: key
        }], {
            onConflict: 'idempotency_key',
            ignoreDuplicates: true
        })
        .select()
        .maybeSingle()

    if (historico.error) return historico.error

    const auditoria = await registrarAuditoria({
        entidade_tipo: 'ordem_fornecimento_prazo',
        entidade_id: ordem.id,
        acao: OVERDUE_EVENT_TYPE,
        dados: {
            ciclo,
            data_limite: dataLimite,
            status_prazo: STATUS_PRAZO.ATRASADA,
            responsavel_ids: responsaveis,
            data_referencia: hoje
        },
        idempotency_key: key
    })

    if (auditoria.error) return auditoria.error

    if (ordem.paciente_id) {
        const ocorrencia = await registrarOcorrencia({
            paciente_id: ordem.paciente_id,
            usuario_id: null,
            tipo_evento: `OF_${OVERDUE_EVENT_TYPE}`,
            descricao: `A Ordem de Fornecimento ${ordem.numero} esta atrasada.`,
            referencia_id: ordem.id,
            idempotency_key: key
        })

        if (ocorrencia.error) return ocorrencia.error
    }

    return null
}

export async function processarOrdemDeAtraso(ordem, {
    hoje,
    feriados,
    logger = console
}) {
    if (!isEligibleForOverdue(ordem)) return { status: 'ignorada' }

    if (!isDeadlineOverdue({
        deadline: ordem.data_previsao_entrega,
        today: hoje,
        holidays: feriados
    })) {
        return { status: 'fora_do_marco' }
    }

    const inconsistencias = await auditarInconsistencias(ordem, logger)

    const atualizacao = await atualizarStatusCondicionalmente(ordem)
    if (atualizacao.error) return { status: 'erro', error: atualizacao.error, inconsistencias: inconsistencias.length }

    // A releitura impede que uma ordem finalizada ou prorrogada durante o
    // processamento receba o evento do ciclo antigo.
    const atual = await buscarOrdemAtual(ordem.id)
    if (atual.error) return { status: 'erro', error: atual.error, inconsistencias: inconsistencias.length }
    if (!atual.data || !isEligibleForOverdue(atual.data)) {
        return { status: 'alterada_durante_processamento', inconsistencias: inconsistencias.length }
    }

    if (!isDeadlineOverdue({
        deadline: atual.data.data_previsao_entrega,
        today: hoje,
        holidays: feriados
    })) {
        return { status: 'alterada_durante_processamento', inconsistencias: inconsistencias.length }
    }

    const eventoError = await registrarEventoDeAtraso(atual.data, hoje)
    if (eventoError) return { status: 'erro', error: eventoError }

    return {
        status: 'atrasada',
        transicionada: Boolean(atualizacao.transicionada),
        inconsistencias: inconsistencias.length
    }
}

async function executarJobDeAtrasoInterno({
    now = new Date(),
    logger = console,
    executionId = null
} = {}) {
    const hoje = getBrasiliaDate(now)
    const feriadosResult = await listarDatasFeriadosAtivos()
    if (feriadosResult.error) throw feriadosResult.error

    const ordensResult = await supabaseAdmin
        .from('ordens_fornecimento')
        .select(ORDER_SELECT)
        .in('status', ACTIVE_ORDER_STATUSES)
        .not('data_previsao_entrega', 'is', null)

    if (ordensResult.error) throw ordensResult.error

    const resumo = {
        hoje,
        examinadas: ordensResult.data?.length || 0,
        atrasadas: 0,
        transicionadas: 0,
        ordensAfetadas: 0,
        notificacoesCriadas: 0,
        emailsEnviados: 0,
        retentativas: 0,
        inconsistencias: 0,
        ignoradas: 0,
        erros: 0
    }

    for (const ordem of ordensResult.data || []) {
        try {
            const resultado = await processarOrdemDeAtraso(ordem, {
                hoje,
                feriados: feriadosResult.data || [],
                logger
            })

            if (resultado.status === 'atrasada') {
                resumo.atrasadas += 1
                if (resultado.transicionada) resumo.transicionadas += 1
                resumo.ordensAfetadas += resultado.transicionada ? 1 : 0
                resumo.inconsistencias += resultado.inconsistencias || 0
                await registrarItemExecucao({
                    execucaoId: executionId,
                    ordemId: ordem.id,
                    status: 'atrasada',
                    metadados: {
                        transicionada: Boolean(resultado.transicionada),
                        inconsistencias: resultado.inconsistencias || 0
                    }
                })
            } else if (resultado.status === 'erro') {
                resumo.erros += 1
                resumo.inconsistencias += resultado.inconsistencias || 0
                logger.error?.('Erro ao processar atraso de prazo', {
                    ordemId: ordem.id,
                    error: resultado.error
                })
                await registrarItemExecucao({
                    execucaoId: executionId,
                    ordemId: ordem.id,
                    status: 'falha',
                    erro: resultado.error?.message || 'Falha ao processar ordem',
                    metadados: { inconsistencias: resultado.inconsistencias || 0 }
                })
            } else {
                resumo.ignoradas += 1
                resumo.inconsistencias += resultado.inconsistencias || 0
                await registrarItemExecucao({
                    execucaoId: executionId,
                    ordemId: ordem.id,
                    status: resultado.status,
                    metadados: { inconsistencias: resultado.inconsistencias || 0 }
                })
            }
        } catch (error) {
            resumo.erros += 1
            logger.error?.('Erro ao processar atraso de prazo', {
                ordemId: ordem.id,
                error
            })
            await registrarItemExecucao({
                execucaoId: executionId,
                ordemId: ordem.id,
                status: 'falha',
                erro: error.message,
                metadados: { excecao: true }
            })
        }
    }

    return resumo
}

export async function executarJobDeAtraso({
    now = new Date(),
    logger = console,
    origem = 'automatico',
    solicitanteId = null,
    db
} = {}) {
    return await executarComLease({
        jobNome: AUTOMACAO_JOB.ATRASO,
        origem,
        solicitanteId,
        now,
        logger,
        db,
        executar: ({ executionId }) => executarJobDeAtrasoInterno({
            now,
            logger,
            executionId
        })
    })
}

export function iniciarJobDeAtraso({
    intervalMs = Number(process.env.ATRASO_JOB_INTERVAL_MS || 15 * 60 * 1000),
    logger = console
} = {}) {
    let executando = false
    const intervaloSeguro = Number.isFinite(intervalMs) && intervalMs > 0
        ? intervalMs
        : 15 * 60 * 1000

    const executar = async () => {
        if (executando) return null
        executando = true
        try {
            return await executarJobDeAtraso({ logger })
        } catch (error) {
            logger.error?.('Erro no job de atrasos', error)
            return null
        } finally {
            executando = false
        }
    }

    const timer = setInterval(executar, intervaloSeguro)
    timer.unref?.()
    void executar()

    return {
        executar,
        parar: () => clearInterval(timer)
    }
}

