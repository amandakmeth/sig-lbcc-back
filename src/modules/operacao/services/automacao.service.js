import { randomUUID } from 'node:crypto'
import supabaseAdmin from '../../../config/supabaseAdmin.js'
import { registrarAuditoria } from '../../historico_pacientes/services/auditoria.service.js'

export const AUTOMACAO_JOB = Object.freeze({
    PROXIMIDADE: 'proximidade',
    ATRASO: 'atraso',
    LEMBRETES_FORNECEDOR: 'lembretes_fornecedor'
})

export const AUTOMACAO_EXECUTION_STATUS = Object.freeze({
    EXECUTANDO: 'executando',
    CONCLUIDA: 'concluida',
    CONCLUIDA_COM_FALHAS: 'concluida_com_falhas',
    FALHA: 'falha',
    IGNORADA: 'ignorada'
})

const configuredLeaseTtlMs = Number(process.env.AUTOMACAO_LEASE_TTL_MS)
const DEFAULT_LEASE_TTL_MS = Number.isFinite(configuredLeaseTtlMs) && configuredLeaseTtlMs > 0
    ? configuredLeaseTtlMs
    : 10 * 60 * 1000

function toDate(value) {
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? new Date() : date
}

function asInteger(value) {
    const number = Number(value)
    return Number.isFinite(number) ? number : 0
}

function resultFromRpc(data) {
    if (Array.isArray(data)) return data[0] || null
    return data || null
}

export async function adquirirLease({
    nome,
    holderId = randomUUID(),
    ttlMs = DEFAULT_LEASE_TTL_MS,
    db = supabaseAdmin
}) {
    if (typeof db.rpc !== 'function') {
        return {
            acquired: false,
            holderId,
            error: new Error('O banco nao oferece suporte a lease distribuido')
        }
    }

    const result = await db.rpc('adquirir_lease_automacao', {
        p_nome: nome,
        p_holder_id: holderId,
        p_ttl_seconds: Math.max(1, Math.ceil(ttlMs / 1000))
    })

    if (result.error) {
        return { acquired: false, holderId, error: result.error }
    }

    const lease = resultFromRpc(result.data)
    return {
        acquired: Boolean(lease),
        holderId,
        lease,
        error: null
    }
}

export async function renovarLease({
    nome,
    holderId,
    ttlMs = DEFAULT_LEASE_TTL_MS,
    db = supabaseAdmin
}) {
    if (typeof db.rpc !== 'function') return { data: null, error: null }

    return await db.rpc('renovar_lease_automacao', {
        p_nome: nome,
        p_holder_id: holderId,
        p_ttl_seconds: Math.max(1, Math.ceil(ttlMs / 1000))
    })
}

export async function liberarLease({ nome, holderId, db = supabaseAdmin }) {
    if (typeof db.rpc !== 'function') return { data: null, error: null }

    return await db.rpc('liberar_lease_automacao', {
        p_nome: nome,
        p_holder_id: holderId
    })
}

export async function iniciarExecucao({
    jobNome,
    origem = 'automatico',
    solicitanteId = null,
    holderId,
    iniciadoEm = new Date(),
    db = supabaseAdmin
}) {
    return await db
        .from('automacao_execucoes')
        .insert([{
            job_nome: jobNome,
            origem,
            solicitante_id: solicitanteId,
            holder_id: holderId,
            status: AUTOMACAO_EXECUTION_STATUS.EXECUTANDO,
            iniciado_em: toDate(iniciadoEm).toISOString()
        }])
        .select()
        .single()
}

export function resumirMetricas(resumo = {}) {
    return {
        ordens_examinadas: asInteger(resumo.ordensExaminadas ?? resumo.examinadas),
        ordens_afetadas: asInteger(
            resumo.ordensAfetadas
            ?? resumo.transicionadas
            ?? resumo.alertadas
            ?? resumo.enviados
        ),
        notificacoes_criadas: asInteger(
            resumo.notificacoesCriadas ?? resumo.notificacoes
        ),
        emails_enviados: asInteger(resumo.emailsEnviados ?? resumo.enviados),
        falhas: asInteger(resumo.falhas ?? resumo.erros),
        retentativas: asInteger(resumo.retentativas),
        inconsistencias: asInteger(resumo.inconsistencias)
    }
}

export async function finalizarExecucao({
    id,
    status,
    resumo = {},
    erro = null,
    finalizadoEm = new Date(),
    db = supabaseAdmin
}) {
    const metricas = resumirMetricas(resumo)
    return await db
        .from('automacao_execucoes')
        .update({
            status,
            finalizado_em: toDate(finalizadoEm).toISOString(),
            resumo,
            ordens_examinadas: metricas.ordens_examinadas,
            ordens_afetadas: metricas.ordens_afetadas,
            notificacoes_criadas: metricas.notificacoes_criadas,
            emails_enviados: metricas.emails_enviados,
            falhas: metricas.falhas,
            retentativas: metricas.retentativas,
            inconsistencias: metricas.inconsistencias,
            erro
        })
        .eq('id', id)
        .select()
        .single()
}

export async function registrarItemExecucao({
    execucaoId,
    ordemId = null,
    status,
    notificacoesCriadas = 0,
    emailsEnviados = 0,
    retentativas = 0,
    erro = null,
    metadados = {},
    db = supabaseAdmin
}) {
    if (!execucaoId) return { data: null, error: null }

    return await db
        .from('automacao_execucao_itens')
        .insert([{
            execucao_id: execucaoId,
            ordem_fornecimento_id: ordemId,
            status,
            notificacoes_criadas: asInteger(notificacoesCriadas),
            emails_enviados: asInteger(emailsEnviados),
            retentativas: asInteger(retentativas),
            erro,
            metadados
        }])
        .select()
        .single()
}

export async function registrarPendenciaAdministrativa({
    chave,
    tipo,
    ordemId = null,
    descricao,
    dados = {},
    db = supabaseAdmin
}) {
    const agora = new Date().toISOString()
    const atual = await db
        .from('pendencias_administrativas')
        .select('id, ocorrencias')
        .eq('chave', chave)
        .maybeSingle()

    if (atual.error) return atual

    if (atual.data) {
        return await db
            .from('pendencias_administrativas')
            .update({
                ocorrencias: Number(atual.data.ocorrencias || 0) + 1,
                ultima_ocorrencia_em: agora,
                descricao,
                dados,
                updated_at: agora
            })
            .eq('id', atual.data.id)
            .select()
            .single()
    }

    return await db
        .from('pendencias_administrativas')
        .insert([{
            chave,
            tipo,
            ordem_fornecimento_id: ordemId,
            descricao,
            dados,
            status: 'pendente',
            ocorrencias: 1,
            primeira_ocorrencia_em: agora,
            ultima_ocorrencia_em: agora,
            updated_at: agora
        }])
        .select()
        .single()
}

export async function registrarInconsistencia({
    ordem,
    tipo,
    descricao,
    dados = {},
    logger = console,
    db = supabaseAdmin
}) {
    const chave = `ordem:${ordem?.id || 'desconhecida'}:${tipo}`
    let pendencia
    try {
        pendencia = await registrarPendenciaAdministrativa({
            chave,
            tipo,
            ordemId: ordem?.id || null,
            descricao,
            dados,
            db
        })
    } catch (error) {
        pendencia = { data: null, error }
    }

    if (pendencia.error) {
        logger.error?.('Falha ao registrar pendencia administrativa', {
            ordemId: ordem?.id,
            tipo,
            error: pendencia.error
        })
    }

    let auditoria
    try {
        auditoria = await registrarAuditoria({
            entidade_tipo: 'ordem_fornecimento',
            entidade_id: ordem?.id || null,
            acao: 'AUTOMACAO_INCONSISTENCIA',
            dados: {
                tipo,
                descricao,
                ...dados
            },
            idempotency_key: chave
        })
    } catch (error) {
        auditoria = { data: null, error }
    }

    if (auditoria.error) {
        logger.error?.('Falha ao auditar inconsistencia da automacao', {
            ordemId: ordem?.id,
            tipo,
            error: auditoria.error
        })
    }

    return {
        pendencia: pendencia.data || null,
        auditoria: auditoria.data || null,
        error: pendencia.error || auditoria.error || null
    }
}

export async function listarExecucoes({
    limite = 50,
    jobNome = null,
    db = supabaseAdmin
}) {
    let query = db
        .from('automacao_execucoes')
        .select('*')
        .order('iniciado_em', { ascending: false })
        .limit(Math.min(Math.max(Number(limite) || 50, 1), 100))

    if (jobNome) query = query.eq('job_nome', jobNome)
    return await query
}

export async function listarPendencias({
    status = 'pendente',
    limite = 100,
    db = supabaseAdmin
}) {
    let query = db
        .from('pendencias_administrativas')
        .select('*')
        .order('ultima_ocorrencia_em', { ascending: false })
        .limit(Math.min(Math.max(Number(limite) || 100, 1), 200))

    if (status) query = query.eq('status', status)
    return await query
}

export async function buscarExecucao({ id, db = supabaseAdmin }) {
    const execucao = await db
        .from('automacao_execucoes')
        .select('*')
        .eq('id', id)
        .maybeSingle()

    if (execucao.error || !execucao.data) return execucao

    const itens = await db
        .from('automacao_execucao_itens')
        .select('*')
        .eq('execucao_id', id)
        .order('created_at', { ascending: true })

    if (itens.error) return { data: null, error: itens.error }
    return {
        data: { ...execucao.data, itens: itens.data || [] },
        error: null
    }
}

function statusDaExecucao(resumo) {
    return asInteger(resumo.falhas ?? resumo.erros) > 0
        ? AUTOMACAO_EXECUTION_STATUS.CONCLUIDA_COM_FALHAS
        : AUTOMACAO_EXECUTION_STATUS.CONCLUIDA
}

export async function executarComLease({
    jobNome,
    origem = 'automatico',
    solicitanteId = null,
    now = new Date(),
    ttlMs = DEFAULT_LEASE_TTL_MS,
    logger = console,
    db = supabaseAdmin,
    executar
}) {
    const holderId = `${process.pid}:${randomUUID()}`
    const execucao = await iniciarExecucao({
        jobNome,
        origem,
        solicitanteId,
        holderId,
        iniciadoEm: now,
        db
    })

    if (execucao.error) throw execucao.error

    const lease = await adquirirLease({
        nome: jobNome,
        holderId,
        ttlMs,
        db
    })

    if (lease.error) {
        await finalizarExecucao({
            id: execucao.data.id,
            status: AUTOMACAO_EXECUTION_STATUS.FALHA,
            erro: lease.error.message,
            db
        })
        throw lease.error
    }

    if (!lease.acquired) {
        const resumo = {
            ordensExaminadas: 0,
            ordensAfetadas: 0,
            notificacoesCriadas: 0,
            emailsEnviados: 0,
            falhas: 0,
            retentativas: 0,
            motivo: 'execucao_em_andamento'
        }
        const finalizada = await finalizarExecucao({
            id: execucao.data.id,
            status: AUTOMACAO_EXECUTION_STATUS.IGNORADA,
            resumo,
            db
        })
        if (finalizada.error) logger.error?.('Falha ao registrar execucao ignorada', finalizada.error)
        return {
            executionId: execucao.data.id,
            jobNome,
            status: AUTOMACAO_EXECUTION_STATUS.IGNORADA,
            lockAdquirido: false,
            ...resumo
        }
    }

    const heartbeatMs = Math.max(1000, Math.floor(ttlMs / 3))
    const heartbeat = setInterval(() => {
        void renovarLease({ nome: jobNome, holderId, ttlMs, db }).catch((error) => {
            logger.error?.('Falha ao renovar lease da automacao', { jobNome, error })
        })
    }, heartbeatMs)
    heartbeat.unref?.()

    try {
        const resumo = await executar({
            executionId: execucao.data.id,
            holderId
        })
        const status = statusDaExecucao(resumo)
        const finalizada = await finalizarExecucao({
            id: execucao.data.id,
            status,
            resumo,
            db
        })
        if (finalizada.error) {
            logger.error?.('Falha ao finalizar execucao da automacao', {
                jobNome,
                executionId: execucao.data.id,
                error: finalizada.error
            })
        }

        return {
            executionId: execucao.data.id,
            jobNome,
            status,
            lockAdquirido: true,
            ...resumo
        }
    } catch (error) {
        await finalizarExecucao({
            id: execucao.data.id,
            status: AUTOMACAO_EXECUTION_STATUS.FALHA,
            erro: error.message,
            db
        })
        throw error
    } finally {
        clearInterval(heartbeat)
        try {
            const liberado = await liberarLease({ nome: jobNome, holderId, db })
            if (liberado.error) {
                logger.error?.('Falha ao liberar lease da automacao', {
                    jobNome,
                    error: liberado.error
                })
            }
        } catch (error) {
            logger.error?.('Falha ao liberar lease da automacao', {
                jobNome,
                error
            })
        }
    }
}
