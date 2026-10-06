import supabaseAdmin from '../../../config/supabaseAdmin.js'
import { listarDatasFeriadosAtivos } from '../../calendario/services/calendario.service.js'
import {
    registrarAuditoria,
    registrarOcorrencia
} from '../../historico_pacientes/services/auditoria.service.js'
import {
    criarNotificacaoInterna,
    montarChaveDeNotificacao,
    NOTIFICACAO_TIPO
} from './notificacoes.service.js'
import { criarLembreteFornecedorPendente } from './lembretes-fornecedor.service.js'
import {
    calculateDeadlineStatus,
    getBrasiliaDate,
    STATUS_PRAZO,
    toDateOnly
} from '../../fornecimento/services/prazo.utils.js'
import {
    AUTOMACAO_JOB,
    executarComLease,
    registrarInconsistencia,
    registrarItemExecucao
} from '../../operacao/services/automacao.service.js'

export const ACTIVE_ORDER_STATUSES = Object.freeze(['enviada', 'em_entrega'])

const ORDER_SELECT = `
    id,
    numero,
    cotacao_id,
    fornecedor_id,
    paciente_id,
    status,
    data_previsao_entrega,
    prazo_ciclo,
    status_prazo,
    fornecedores:fornecedor_id (
        id,
        razao_social,
        nome_fantasia
    ),
    pacientes:paciente_id (
        id,
        nome
    ),
    cotacoes:cotacao_id (
        id,
        numero,
        descricao
    ),
    ordem_fornecimento_responsaveis (
        usuario_id,
        usuarios:usuario_id (
            id,
            nome,
            email,
            perfil,
            ativo
        )
    )
`

function fornecedorNome(ordem) {
    return ordem.fornecedores?.nome_fantasia
        || ordem.fornecedores?.razao_social
        || '-'
}

function cotacaoNumero(ordem) {
    return ordem.cotacoes?.numero || ordem.cotacao_id || '-'
}

function responsaveisAtivos(ordem) {
    return (ordem.ordem_fornecimento_responsaveis || [])
        .map((item) => item.usuarios)
        .filter((usuario) => usuario?.id && usuario.perfil === 'gestor' && usuario.ativo !== false)
}

export function diagnosticarInconsistencias(ordem) {
    const inconsistencias = []

    if (!ordem?.fornecedor_id || !ordem?.fornecedores) {
        inconsistencias.push({
            tipo: 'FORNECEDOR_AUSENTE',
            descricao: 'A ordem nao possui fornecedor valido para a automacao.'
        })
    }

    if (!ordem?.cotacao_id || !ordem?.cotacoes) {
        inconsistencias.push({
            tipo: 'COTACAO_AUSENTE',
            descricao: 'A ordem nao possui cotacao valida para a automacao.'
        })
    }

    if (!ordem?.paciente_id || !ordem?.pacientes) {
        inconsistencias.push({
            tipo: 'PACIENTE_AUSENTE',
            descricao: 'A ordem nao possui paciente valido para a automacao.'
        })
    }

    if (responsaveisAtivos(ordem).length === 0) {
        inconsistencias.push({
            tipo: 'GESTORES_RESPONSAVEIS_AUSENTES',
            descricao: 'A ordem nao possui Gestor ativo responsavel para receber a notificacao.'
        })
    }

    return inconsistencias
}

async function auditarInconsistencias(ordem, logger) {
    const inconsistencias = diagnosticarInconsistencias(ordem)
    for (const inconsistencia of inconsistencias) {
        await registrarInconsistencia({
            ordem,
            tipo: inconsistencia.tipo,
            descricao: inconsistencia.descricao,
            dados: { ordem_numero: ordem.numero },
            logger
        })
    }
    return inconsistencias
}

async function registrarItemSeguro(dados, logger) {
    const resultado = await registrarItemExecucao(dados)
    if (resultado.error) {
        logger.error?.('Falha ao registrar item da execucao de proximidade', {
            ordemId: dados.ordemId,
            error: resultado.error
        })
    }
}

export function isEligibleOrder(ordem) {
    return ACTIVE_ORDER_STATUSES.includes(ordem?.status)
        && Boolean(toDateOnly(ordem?.data_previsao_entrega))
}

export function buildProximityNotification({ ordem, destinatarioId }) {
    const dataLimite = toDateOnly(ordem.data_previsao_entrega)
    const ciclo = Number(ordem.prazo_ciclo || 1)
    const fornecedor = fornecedorNome(ordem)
    const cotacao = cotacaoNumero(ordem)
    const paciente = ordem.pacientes?.nome || '-'
    const link = `/fornecimento/${ordem.id}`

    return {
        destinatarioId,
        tipo: NOTIFICACAO_TIPO.OF_PROXIMA_EXPIRACAO,
        titulo: `Ordem ${ordem.numero} proxima da expiracao`,
        mensagem: `A ordem ${ordem.numero} do paciente ${paciente}, fornecedor ${fornecedor} e cotacao ${cotacao} vence em ${dataLimite}.`,
        link,
        dados: {
            ordem: { id: ordem.id, numero: ordem.numero },
            paciente: { id: ordem.paciente_id, nome: paciente },
            fornecedor: { id: ordem.fornecedor_id, nome: fornecedor },
            cotacao: { id: ordem.cotacao_id, numero: cotacao },
            data_limite: dataLimite,
            status_prazo: STATUS_PRAZO.PROXIMA_EXPIRACAO,
            link
        },
        ordemFornecimentoId: ordem.id,
        prazoCiclo: ciclo,
        dataLimite,
        statusPrazo: STATUS_PRAZO.PROXIMA_EXPIRACAO,
        idempotencyKey: montarChaveDeNotificacao({
            ordemId: ordem.id,
            ciclo,
            destinatarioId
        })
    }
}

async function buscarOrdemAtual(id) {
    return await supabaseAdmin
        .from('ordens_fornecimento')
        .select(ORDER_SELECT)
        .eq('id', id)
        .maybeSingle()
}

async function registrarEventoDeProximidade(ordem, hoje) {
    const ciclo = Number(ordem.prazo_ciclo || 1)
    const dataLimite = toDateOnly(ordem.data_previsao_entrega)
    const idempotencyKey = `of:${ordem.id}:ciclo:${ciclo}:proximidade`
    const responsavelIds = responsaveisAtivos(ordem).map((usuario) => usuario.id).sort()

    const historico = await supabaseAdmin
        .from('ordem_fornecimento_prazo_historico')
        .upsert([{
            ordem_fornecimento_id: ordem.id,
            ciclo,
            data_limite: dataLimite,
            status_prazo: STATUS_PRAZO.PROXIMA_EXPIRACAO,
            tipo_evento: 'PRAZO_PROXIMIDADE_ATINGIDA',
            responsavel_ids: responsavelIds,
            idempotency_key: idempotencyKey,
            usuario_id: null
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
        acao: 'PRAZO_PROXIMIDADE_ATINGIDA',
        dados: {
            ciclo,
            data_limite: dataLimite,
            status_prazo: STATUS_PRAZO.PROXIMA_EXPIRACAO,
            responsavel_ids: responsavelIds,
            data_referencia: hoje
        },
        idempotency_key: idempotencyKey
    })

    if (auditoria.error) return auditoria.error

    if (ordem.paciente_id) {
        const ocorrencia = await registrarOcorrencia({
            paciente_id: ordem.paciente_id,
            usuario_id: null,
            tipo_evento: 'OF_PRAZO_PROXIMIDADE_ATINGIDA',
            descricao: `A Ordem de Fornecimento ${ordem.numero} esta proxima da expiracao.`,
            referencia_id: ordem.id,
            idempotency_key: idempotencyKey
        })

        if (ocorrencia.error) return ocorrencia.error
    }

    return null
}

async function atualizarStatusCondicionalmente(ordem) {
    if (ordem.status_prazo === STATUS_PRAZO.PROXIMA_EXPIRACAO) {
        return { data: ordem, error: null }
    }

    return await supabaseAdmin
        .from('ordens_fornecimento')
        .update({
            status_prazo: STATUS_PRAZO.PROXIMA_EXPIRACAO,
            prazo_atualizado_em: new Date().toISOString(),
            atualizado_por: null
        })
        .eq('id', ordem.id)
        .in('status', ACTIVE_ORDER_STATUSES)
        .eq('data_previsao_entrega', toDateOnly(ordem.data_previsao_entrega))
        .eq('prazo_ciclo', Number(ordem.prazo_ciclo || 1))
        .neq('status_prazo', STATUS_PRAZO.PROXIMA_EXPIRACAO)
        .select(ORDER_SELECT)
        .maybeSingle()
}

async function processarOrdem(ordem, { hoje, feriados, now = new Date(), logger = console }) {
    if (!isEligibleOrder(ordem)) return { status: 'ignorada' }

    const dataLimite = toDateOnly(ordem.data_previsao_entrega)
    // Depois do prazo, o job de proximidade não deve criar um novo alerta
    // durante o intervalo não útil que antecede o primeiro dia de atraso.
    if (dataLimite < hoje) {
        return { status: 'fora_do_marco' }
    }
    const statusCalculado = calculateDeadlineStatus({
        deadline: dataLimite,
        today: hoje,
        holidays: feriados
    })

    if (statusCalculado !== STATUS_PRAZO.PROXIMA_EXPIRACAO) {
        return { status: 'fora_do_marco' }
    }

    const inconsistencias = await auditarInconsistencias(ordem, logger)

    const atualizacao = await atualizarStatusCondicionalmente(ordem)
    if (atualizacao.error) return { status: 'erro', error: atualizacao.error }

    // Rele a ordem apos a atualizacao para evitar alertar uma ordem finalizada
    // ou alterada por outro processo durante esta execucao.
    const atual = await buscarOrdemAtual(ordem.id)
    if (atual.error) return { status: 'erro', error: atual.error }
    if (!isEligibleOrder(atual.data) || atual.data.status_prazo !== STATUS_PRAZO.PROXIMA_EXPIRACAO) {
        return { status: 'alterada_durante_processamento' }
    }

    const eventoError = await registrarEventoDeProximidade(atual.data, hoje)
    if (eventoError) return { status: 'erro', error: eventoError }

    const notificacoes = []
    for (const responsavel of responsaveisAtivos(atual.data)) {
        const resultado = await criarNotificacaoInterna(
            buildProximityNotification({
                ordem: atual.data,
                destinatarioId: responsavel.id
            })
        )

        if (resultado.error) return { status: 'erro', error: resultado.error }
        if (resultado.data) notificacoes.push(resultado.data)
    }

    // O lembrete e persistido separadamente. Uma falha nessa agenda ou no
    // SMTP nao pode impedir a notificacao interna que acabou de ser criada.
    const lembrete = await criarLembreteFornecedorPendente({
        ordemId: atual.data.id,
        prazoCiclo: Number(atual.data.prazo_ciclo || 1),
        dataLimite,
        now
    })

    if (lembrete.error) {
        logger.error?.('Falha ao agendar lembrete do fornecedor', {
            ordemId: atual.data.id,
            error: lembrete.error
        })
    }

    return {
        status: 'alertada',
        transicionada: ordem.status_prazo !== STATUS_PRAZO.PROXIMA_EXPIRACAO,
        notificacoes,
        lembrete: lembrete.error ? null : lembrete.data,
        lembreteError: lembrete.error || null,
        inconsistencias: inconsistencias.length
    }
}

async function executarJobDeProximidadeInterno({
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
        alertadas: 0,
        transicionadas: 0,
        notificacoes: 0,
        notificacoesCriadas: 0,
        emailsEnviados: 0,
        retentativas: 0,
        inconsistencias: 0,
        ignoradas: 0,
        erros: 0
    }

    for (const ordem of ordensResult.data || []) {
        try {
            const resultado = await processarOrdem(ordem, {
                hoje,
                feriados: feriadosResult.data || [],
                now,
                logger
            })

            if (resultado.status === 'alertada') {
                resumo.alertadas += 1
                if (resultado.transicionada) resumo.transicionadas += 1
                resumo.notificacoes += resultado.notificacoes.length
                resumo.notificacoesCriadas += resultado.notificacoes.length
                resumo.inconsistencias += resultado.inconsistencias || 0
                if (resultado.lembreteError) resumo.erros += 1
                await registrarItemSeguro({
                    execucaoId: executionId,
                    ordemId: ordem.id,
                    status: 'alertada',
                    notificacoesCriadas: resultado.notificacoes.length,
                    metadados: {
                        transicionada: Boolean(resultado.transicionada),
                        inconsistencias: resultado.inconsistencias || 0,
                        notificacao_ids: resultado.notificacoes.map((item) => item.id).filter(Boolean),
                        lembrete_id: resultado.lembrete?.id || null,
                        lembrete_erro: resultado.lembreteError?.message || null
                    },
                    erro: resultado.lembreteError?.message || null
                }, logger)
            } else if (resultado.status === 'erro') {
                resumo.erros += 1
                resumo.inconsistencias += resultado.inconsistencias || 0
                logger.error?.('Erro ao processar alerta de proximidade', {
                    ordemId: ordem.id,
                    error: resultado.error
                })
                await registrarItemSeguro({
                    execucaoId: executionId,
                    ordemId: ordem.id,
                    status: 'falha',
                    erro: resultado.error?.message || 'Falha ao processar ordem',
                    metadados: { inconsistencias: resultado.inconsistencias || 0 }
                }, logger)
            } else {
                resumo.ignoradas += 1
                await registrarItemSeguro({
                    execucaoId: executionId,
                    ordemId: ordem.id,
                    status: resultado.status,
                    metadados: { motivo: resultado.status }
                }, logger)
            }
        } catch (error) {
            resumo.erros += 1
            logger.error?.('Erro ao processar alerta de proximidade', {
                ordemId: ordem.id,
                error
            })
            await registrarItemSeguro({
                execucaoId: executionId,
                ordemId: ordem.id,
                status: 'falha',
                erro: error.message,
                metadados: { excecao: true }
            }, logger)
        }
    }

    return resumo
}

export async function executarJobDeProximidade({
    now = new Date(),
    logger = console,
    origem = 'automatico',
    solicitanteId = null,
    db
} = {}) {
    return await executarComLease({
        jobNome: AUTOMACAO_JOB.PROXIMIDADE,
        origem,
        solicitanteId,
        now,
        logger,
        db,
        executar: ({ executionId }) => executarJobDeProximidadeInterno({
            now,
            logger,
            executionId
        })
    })
}

export function iniciarJobDeProximidade({
    intervalMs = Number(process.env.PROXIMIDADE_JOB_INTERVAL_MS || 15 * 60 * 1000),
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
            return await executarJobDeProximidade({ logger })
        } catch (error) {
            logger.error?.('Erro no job de alertas de proximidade', error)
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
