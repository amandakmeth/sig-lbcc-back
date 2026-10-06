import supabaseAdmin from '../../../config/supabaseAdmin.js'
import { registrarAuditoria } from '../../historico_pacientes/services/auditoria.service.js'
import { toDateOnly } from '../../fornecimento/services/prazo.utils.js'
import { createSmtpAdapter } from './smtp.adapter.js'
import {
    AUTOMACAO_JOB,
    executarComLease,
    registrarInconsistencia,
    registrarItemExecucao
} from '../../operacao/services/automacao.service.js'

export const LEMBRETE_STATUS = Object.freeze({
    PENDENTE: 'pendente',
    ENVIADO: 'enviado',
    FALHA_RECUPERAVEL: 'falha_recuperavel',
    FALHA_DEFINITIVA: 'falha_definitiva'
})

export const MAX_TENTATIVAS_LEMBRETE = 3
const ACTIVE_ORDER_STATUSES = new Set(['enviada', 'em_entrega'])

// A primeira tentativa acontece aproximadamente cinco minutos depois do alerta.
// As duas seguintes ficam programadas para cerca de trinta minutos e duas horas.
export const LEMBRETE_TENTATIVA_DELAYS_MS = Object.freeze([
    5 * 60 * 1000,
    30 * 60 * 1000,
    2 * 60 * 60 * 1000
])

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const LEMBRETE_SELECT = `
    id,
    ordem_fornecimento_id,
    prazo_ciclo,
    status,
    tentativas_realizadas,
    proxima_tentativa_em,
    ultima_tentativa_em,
    ultimo_destinatario_email,
    ultimo_erro,
    ultimo_metadado,
    created_at,
    updated_at
`

const TENTATIVA_SELECT = `
    id,
    lembrete_fornecedor_id,
    numero_tentativa,
    status,
    destinatario_email,
    erro,
    metadados,
    iniciado_em,
    finalizado_em,
    created_at
`

const ORDER_SELECT = `
    id,
    numero,
    cotacao_id,
    fornecedor_id,
    status,
    status_prazo,
    data_previsao_entrega,
    prazo_ciclo,
    fornecedores:fornecedor_id (
        id,
        razao_social,
        nome_fantasia,
        email,
        ativo
    ),
    cotacoes:cotacao_id (
        id,
        numero
    )
`

function toDate(value) {
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

function addMilliseconds(value, milliseconds) {
    const date = toDate(value)
    if (!date) return null
    return new Date(date.getTime() + milliseconds)
}

export function isValidSupplierEmail(value) {
    return typeof value === 'string' && EMAIL_PATTERN.test(value.trim())
}

export function calcularDataDaTentativa({ criadaEm, numeroTentativa }) {
    const delay = LEMBRETE_TENTATIVA_DELAYS_MS[numeroTentativa - 1]
    if (delay === undefined) return null
    return addMilliseconds(criadaEm, delay)
}

export function statusFinalDeFalha({ recuperavel, numeroTentativa }) {
    return recuperavel && numeroTentativa < MAX_TENTATIVAS_LEMBRETE
        ? LEMBRETE_STATUS.FALHA_RECUPERAVEL
        : LEMBRETE_STATUS.FALHA_DEFINITIVA
}

export function classificarFalhaDeEmail(error) {
    if (error?.code === 'CONTATO_FORNECEDOR_INVALIDO') {
        return { recuperavel: false, codigo: error.code }
    }

    if (typeof error?.retryable === 'boolean') {
        return { recuperavel: error.retryable, codigo: error.code || 'SMTP_FAILURE' }
    }

    const statusCode = Number(error?.statusCode)
    if (Number.isFinite(statusCode)) {
        return {
            recuperavel: statusCode >= 400 && statusCode < 500,
            codigo: error.code || 'SMTP_FAILURE'
        }
    }

    return { recuperavel: true, codigo: error?.code || 'SMTP_FAILURE' }
}

function erroSeguro(error) {
    return {
        message: error?.message || 'Falha nao identificada no envio do e-mail',
        code: error?.code || null,
        statusCode: Number.isFinite(Number(error?.statusCode)) ? Number(error.statusCode) : null
    }
}

function fornecedorNome(ordem) {
    return ordem?.fornecedores?.nome_fantasia
        || ordem?.fornecedores?.razao_social
        || '-'
}

function cotacaoNumero(ordem) {
    return ordem?.cotacoes?.numero || ordem?.cotacao_id || '-'
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}

export function buildSecureOrderLink(ordemId, baseUrl = process.env.FRONTEND_URL || process.env.APP_PUBLIC_URL) {
    if (!baseUrl || !ordemId) return null

    try {
        const url = new URL(`/fornecimento/${encodeURIComponent(ordemId)}`, baseUrl)
        const isLocalDevelopment = ['localhost', '127.0.0.1'].includes(url.hostname)
        if (url.protocol !== 'https:' && !isLocalDevelopment) return null
        return url.toString()
    } catch {
        return null
    }
}

export function buildReminderEmail({ ordem, link = buildSecureOrderLink(ordem?.id) }) {
    const numero = ordem?.numero || ordem?.id || '-'
    const fornecedor = fornecedorNome(ordem)
    const cotacao = cotacaoNumero(ordem)
    const dataLimite = toDateOnly(ordem?.data_previsao_entrega) || '-'
    const linkLine = link ? `Acesse a ordem: ${link}` : 'O acesso online a esta ordem nao esta disponivel.'

    const text = [
        `Lembrete sobre a Ordem de Fornecimento ${numero}`,
        '',
        `Fornecedor: ${fornecedor}`,
        `Cotacao: ${cotacao}`,
        `Data limite de entrega: ${dataLimite}`,
        linkLine,
        '',
        'Este e-mail e um lembrete operacional. Responda ao contato institucional caso precise atualizar a entrega.'
    ].join('\n')

    const html = [
        `<h2>Lembrete sobre a Ordem de Fornecimento ${escapeHtml(numero)}</h2>`,
        '<ul>',
        `<li><strong>Fornecedor:</strong> ${escapeHtml(fornecedor)}</li>`,
        `<li><strong>Cotacao:</strong> ${escapeHtml(cotacao)}</li>`,
        `<li><strong>Data limite de entrega:</strong> ${escapeHtml(dataLimite)}</li>`,
        link ? `<li><a href="${escapeHtml(link)}">Acessar ordem de fornecimento</a></li>` : '',
        '</ul>',
        '<p>Este e-mail e um lembrete operacional. Responda ao contato institucional caso precise atualizar a entrega.</p>'
    ].filter(Boolean).join('')

    return {
        subject: `Lembrete - Ordem de Fornecimento ${numero}`,
        text,
        html,
        link
    }
}

async function buscarLembreteBasico({ ordemId, ciclo, db = supabaseAdmin }) {
    let query = db
        .from('lembretes_fornecedor')
        .select(LEMBRETE_SELECT)
        .eq('ordem_fornecimento_id', ordemId)

    if (ciclo !== undefined && ciclo !== null) {
        query = query.eq('prazo_ciclo', ciclo)
    } else {
        query = query.order('prazo_ciclo', { ascending: false }).limit(1)
    }

    return await query.maybeSingle()
}

async function buscarTentativas(lembreteId, db = supabaseAdmin) {
    return await db
        .from('lembretes_fornecedor_tentativas')
        .select(TENTATIVA_SELECT)
        .eq('lembrete_fornecedor_id', lembreteId)
        .order('numero_tentativa', { ascending: false })
}

export async function buscarLembreteFornecedor({ ordemId, ciclo, db = supabaseAdmin }) {
    const lembreteResult = await buscarLembreteBasico({ ordemId, ciclo, db })
    if (lembreteResult.error || !lembreteResult.data) return lembreteResult

    const tentativasResult = await buscarTentativas(lembreteResult.data.id, db)
    if (tentativasResult.error) return { data: null, error: tentativasResult.error }

    return {
        data: {
            ...lembreteResult.data,
            tentativas: tentativasResult.data || []
        },
        error: null
    }
}

export async function criarLembreteFornecedorPendente({
    ordemId,
    prazoCiclo = 1,
    dataLimite = null,
    now = new Date(),
    db = supabaseAdmin
}) {
    const criadaEm = toDate(now) || new Date()
    const registro = {
        ordem_fornecimento_id: ordemId,
        prazo_ciclo: Number(prazoCiclo || 1),
        status: LEMBRETE_STATUS.PENDENTE,
        tentativas_realizadas: 0,
        proxima_tentativa_em: calcularDataDaTentativa({
            criadaEm,
            numeroTentativa: 1
        })?.toISOString() || criadaEm.toISOString(),
        ultimo_metadado: {
            data_limite: dataLimite,
            agendamento: 'proximidade'
        }
    }

    const result = await db
        .from('lembretes_fornecedor')
        .upsert([registro], {
            onConflict: 'ordem_fornecimento_id,prazo_ciclo',
            ignoreDuplicates: true
        })
        .select(LEMBRETE_SELECT)
        .maybeSingle()

    if (result.error) return result
    if (result.data) return result

    return await buscarLembreteBasico({
        ordemId,
        ciclo: registro.prazo_ciclo,
        db
    })
}

async function buscarOrdemParaEnvio(ordemId, db = supabaseAdmin) {
    return await db
        .from('ordens_fornecimento')
        .select(ORDER_SELECT)
        .eq('id', ordemId)
        .maybeSingle()
}

async function registrarAuditoriaDoLembrete({
    ordemId,
    acao,
    tentativa,
    destinatarioEmail,
    status,
    dados = {},
    usuarioId = null
}) {
    return await registrarAuditoria({
        entidade_tipo: 'lembrete_fornecedor',
        entidade_id: ordemId,
        acao,
        usuario_id: usuarioId,
        dados: {
            tentativa,
            destinatario_email: destinatarioEmail || null,
            status,
            ...dados
        },
        idempotency_key: `lembrete-fornecedor:${ordemId}:tentativa:${tentativa}:${acao}`
    })
}

function resultadoIgnorado(lembrete, motivo) {
    return {
        data: lembrete,
        error: null,
        skipped: true,
        motivo
    }
}

function isUniqueViolation(error) {
    return error?.code === '23505' || /duplicate key|unique constraint/i.test(error?.message || '')
}

export async function enviarLembreteFornecedor({
    ordemId,
    ciclo,
    agora = new Date(),
    manual = false,
    usuarioId = null,
    adapter = createSmtpAdapter(),
    db = supabaseAdmin
}) {
    const lembreteResult = await buscarLembreteFornecedor({ ordemId, ciclo, db })
    if (lembreteResult.error) return lembreteResult
    if (!lembreteResult.data) {
        return { data: null, error: { code: 'LEMBRETE_NAO_AGENDADO', message: 'Lembrete do fornecedor nao agendado' } }
    }

    const lembrete = lembreteResult.data
    const now = toDate(agora) || new Date()
    if (lembrete.status === LEMBRETE_STATUS.ENVIADO) return resultadoIgnorado(lembrete, 'ja_enviado')
    if (Number(lembrete.tentativas_realizadas || 0) >= MAX_TENTATIVAS_LEMBRETE) {
        return resultadoIgnorado(lembrete, 'limite_de_tentativas')
    }

    const proximaTentativa = toDate(lembrete.proxima_tentativa_em)
    if (!manual && proximaTentativa && proximaTentativa > now) {
        return resultadoIgnorado(lembrete, 'aguardando_agendamento')
    }

    const ordemResult = await buscarOrdemParaEnvio(ordemId, db)
    if (ordemResult.error || !ordemResult.data) {
        return { data: null, error: ordemResult.error || { message: 'Ordem de fornecimento nao encontrada' } }
    }

    const ordem = ordemResult.data
    if (ordem.status && !ACTIVE_ORDER_STATUSES.has(ordem.status)) {
        return resultadoIgnorado(lembrete, 'ordem_nao_ativa')
    }

    if (ordem.status_prazo && ordem.status_prazo !== 'proxima_expiracao') {
        return resultadoIgnorado(lembrete, 'prazo_nao_esta_proximo')
    }

    if (
        ordem.prazo_ciclo !== undefined
        && ordem.prazo_ciclo !== null
        && Number(ordem.prazo_ciclo) !== Number(lembrete.prazo_ciclo)
    ) {
        return resultadoIgnorado(lembrete, 'ciclo_obsoleto')
    }

    const email = typeof ordem.fornecedores?.email === 'string'
        ? ordem.fornecedores.email.trim().toLowerCase()
        : ''
    const numeroTentativa = Number(lembrete.tentativas_realizadas || 0) + 1
    const metadadosBase = {
        ordem_id: ordem.id,
        ordem_numero: ordem.numero,
        fornecedor_id: ordem.fornecedor_id,
        cotacao_id: ordem.cotacao_id,
        motivo: manual ? 'reenvio_manual' : 'agendamento_automatico'
    }

    const tentativaInsert = await db
        .from('lembretes_fornecedor_tentativas')
        .insert([{
            lembrete_fornecedor_id: lembrete.id,
            numero_tentativa: numeroTentativa,
            status: 'processando',
            destinatario_email: isValidSupplierEmail(email) ? email : null,
            metadados: metadadosBase,
            iniciado_em: now.toISOString()
        }])
        .select(TENTATIVA_SELECT)
        .single()

    if (tentativaInsert.error) {
        if (isUniqueViolation(tentativaInsert.error)) {
            return resultadoIgnorado(lembrete, 'tentativa_em_processamento')
        }
        return { data: null, error: tentativaInsert.error }
    }

    if (manual) {
        await registrarAuditoriaDoLembrete({
            ordemId,
            acao: 'LEMBRETE_FORNECEDOR_REENVIO_MANUAL',
            tentativa: numeroTentativa,
            destinatarioEmail: email,
            status: 'processando',
            dados: metadadosBase,
            usuarioId
        })
    }

    const finalizarTentativa = async ({ status, erro = null, metadados = {} }) => {
        const finalizadoEm = new Date().toISOString()
        const tentativa = await db
            .from('lembretes_fornecedor_tentativas')
            .update({
                status,
                erro,
                metadados: { ...metadadosBase, ...metadados },
                finalizado_em: finalizadoEm
            })
            .eq('id', tentativaInsert.data.id)
            .select(TENTATIVA_SELECT)
            .single()

        return tentativa
    }

    try {
        if (!isValidSupplierEmail(email)) {
            const error = new Error('Fornecedor sem contato principal valido')
            error.code = 'CONTATO_FORNECEDOR_INVALIDO'
            throw error
        }

        const emailData = buildReminderEmail({
            ordem,
            link: buildSecureOrderLink(ordem.id)
        })
        const providerResult = await adapter.send({
            to: email,
            from: process.env.SMTP_FROM,
            subject: emailData.subject,
            text: emailData.text,
            html: emailData.html
        })
        const tentativa = await finalizarTentativa({
            status: 'enviado',
            metadados: {
                provider: providerResult?.provider || 'smtp',
                message_id: providerResult?.messageId || null,
                link_disponivel: Boolean(emailData.link)
            }
        })
        if (tentativa.error) return { data: null, error: tentativa.error }

        const atualizado = await db
            .from('lembretes_fornecedor')
            .update({
                status: LEMBRETE_STATUS.ENVIADO,
                tentativas_realizadas: numeroTentativa,
                proxima_tentativa_em: null,
                ultima_tentativa_em: now.toISOString(),
                ultimo_destinatario_email: email,
                ultimo_erro: null,
                ultimo_metadado: {
                    provider: providerResult?.provider || 'smtp',
                    message_id: providerResult?.messageId || null,
                    link_disponivel: Boolean(emailData.link)
                },
                updated_at: new Date().toISOString()
            })
            .eq('id', lembrete.id)
            .select(LEMBRETE_SELECT)
            .single()

        if (atualizado.error) return { data: null, error: atualizado.error }

        await registrarAuditoriaDoLembrete({
            ordemId,
            acao: 'LEMBRETE_FORNECEDOR_ENVIADO',
            tentativa: numeroTentativa,
            destinatarioEmail: email,
            status: LEMBRETE_STATUS.ENVIADO,
            dados: {
                ...metadadosBase,
                provider: providerResult?.provider || 'smtp',
                message_id: providerResult?.messageId || null,
                link_disponivel: Boolean(emailData.link)
            },
            usuarioId
        })

        return {
            data: atualizado.data,
            error: null,
            status: LEMBRETE_STATUS.ENVIADO,
            tentativa: tentativa.data
        }
    } catch (error) {
        if (error?.code === 'CONTATO_FORNECEDOR_INVALIDO') {
            try {
                await registrarInconsistencia({
                    ordem,
                    tipo: 'CONTATO_FORNECEDOR_AUSENTE_OU_INVALIDO',
                    descricao: 'O fornecedor nao possui contato principal valido para o lembrete.',
                    dados: {
                        ordem_numero: ordem.numero,
                        fornecedor_id: ordem.fornecedor_id
                    },
                    logger: console,
                    db
                })
            } catch (auditoriaError) {
                console.error('Falha ao auditar contato invalido do fornecedor', auditoriaError)
            }
        }

        const failure = classificarFalhaDeEmail(error)
        const status = statusFinalDeFalha({
            recuperavel: failure.recuperavel,
            numeroTentativa
        })
        const detalhe = erroSeguro(error)
        const proxima = failure.recuperavel && numeroTentativa < MAX_TENTATIVAS_LEMBRETE
            ? calcularDataDaTentativa({
                criadaEm: lembrete.created_at || now,
                numeroTentativa: numeroTentativa + 1
            })
            : null

        const tentativa = await finalizarTentativa({
            status,
            erro: detalhe.message,
            metadados: {
                failure_code: failure.codigo,
                retryable: failure.recuperavel
            }
        })
        if (tentativa.error) return { data: null, error: tentativa.error }

        const atualizado = await db
            .from('lembretes_fornecedor')
            .update({
                status,
                tentativas_realizadas: numeroTentativa,
                proxima_tentativa_em: proxima?.toISOString() || null,
                ultima_tentativa_em: now.toISOString(),
                ultimo_destinatario_email: isValidSupplierEmail(email) ? email : null,
                ultimo_erro: detalhe.message,
                ultimo_metadado: {
                    ...metadadosBase,
                    failure_code: failure.codigo,
                    retryable: failure.recuperavel,
                    status_code: detalhe.statusCode
                },
                updated_at: new Date().toISOString()
            })
            .eq('id', lembrete.id)
            .select(LEMBRETE_SELECT)
            .single()

        if (atualizado.error) return { data: null, error: atualizado.error }

        await registrarAuditoriaDoLembrete({
            ordemId,
            acao: 'LEMBRETE_FORNECEDOR_FALHA',
            tentativa: numeroTentativa,
            destinatarioEmail: email,
            status,
            dados: {
                ...metadadosBase,
                erro: detalhe.message,
                failure_code: failure.codigo,
                retryable: failure.recuperavel,
                proxima_tentativa_em: proxima?.toISOString() || null
            },
            usuarioId
        })

        return {
            data: atualizado.data,
            error: null,
            status,
            tentativa: tentativa.data,
            deliveryError: detalhe
        }
    }
}

async function processarLembretesDevidosInterno({
    now = new Date(),
    adapter = createSmtpAdapter(),
    logger = console,
    db = supabaseAdmin,
    executionId = null
} = {}) {
    const referencia = toDate(now) || new Date()
    const lembretesResult = await db
        .from('lembretes_fornecedor')
        .select(LEMBRETE_SELECT)
        .in('status', [LEMBRETE_STATUS.PENDENTE, LEMBRETE_STATUS.FALHA_RECUPERAVEL])
        .lte('proxima_tentativa_em', referencia.toISOString())

    if (lembretesResult.error) throw lembretesResult.error

    const resumo = {
        examinados: lembretesResult.data?.length || 0,
        enviados: 0,
        emailsEnviados: 0,
        ordensAfetadas: 0,
        retentativas: 0,
        falhas: 0,
        ignorados: 0
    }

    for (const lembrete of lembretesResult.data || []) {
        let resultado
        try {
            resultado = await enviarLembreteFornecedor({
                ordemId: lembrete.ordem_fornecimento_id,
                ciclo: lembrete.prazo_ciclo,
                agora: referencia,
                adapter,
                db
            })
        } catch (error) {
            resumo.falhas += 1
            logger.error?.('Erro inesperado ao processar lembrete do fornecedor', {
                ordemId: lembrete.ordem_fornecimento_id,
                error
            })
            await registrarItemExecucao({
                execucaoId: executionId,
                ordemId: lembrete.ordem_fornecimento_id,
                status: 'falha',
                erro: error.message,
                db,
                metadados: { lembrete_id: lembrete.id, excecao: true }
            })
            continue
        }

        if (resultado.error) {
            resumo.falhas += 1
            logger.error?.('Erro ao processar lembrete do fornecedor', {
                ordemId: lembrete.ordem_fornecimento_id,
                error: resultado.error
            })
            await registrarItemExecucao({
                execucaoId: executionId,
                ordemId: lembrete.ordem_fornecimento_id,
                status: 'falha',
                erro: resultado.error.message,
                db,
                metadados: {
                    lembrete_id: lembrete.id,
                    tentativa_id: resultado.tentativa?.data?.id || null
                }
            })
        } else if (resultado.status === LEMBRETE_STATUS.ENVIADO) {
            resumo.enviados += 1
            resumo.emailsEnviados += 1
            resumo.ordensAfetadas += 1
            const retentativas = Math.max(0, Number(resultado.tentativa?.data?.numero_tentativa || 1) - 1)
            resumo.retentativas += retentativas
            await registrarItemExecucao({
                execucaoId: executionId,
                ordemId: lembrete.ordem_fornecimento_id,
                status: 'enviado',
                emailsEnviados: 1,
                retentativas,
                db,
                metadados: {
                    lembrete_id: lembrete.id,
                    tentativa_id: resultado.tentativa?.data?.id || null,
                    destinatario_email: resultado.tentativa?.data?.destinatario_email || null
                }
            })
        } else if (resultado.deliveryError) {
            resumo.falhas += 1
            const retentativas = Math.max(0, Number(resultado.tentativa?.data?.numero_tentativa || 1) - 1)
            resumo.retentativas += retentativas
            await registrarItemExecucao({
                execucaoId: executionId,
                ordemId: lembrete.ordem_fornecimento_id,
                status: resultado.status || 'falha',
                retentativas,
                db,
                metadados: {
                    lembrete_id: lembrete.id,
                    tentativa_id: resultado.tentativa?.data?.id || null,
                    destinatario_email: resultado.tentativa?.data?.destinatario_email || null,
                    erro_entrega: resultado.deliveryError
                }
            })
        } else {
            resumo.ignorados += 1
            await registrarItemExecucao({
                execucaoId: executionId,
                ordemId: lembrete.ordem_fornecimento_id,
                status: 'ignorado',
                db,
                metadados: {
                    lembrete_id: lembrete.id,
                    motivo: resultado.motivo || null
                }
            })
        }
    }

    return resumo
}

export async function processarLembretesDevidos({
    now = new Date(),
    adapter = createSmtpAdapter(),
    logger = console,
    db = supabaseAdmin,
    origem = 'automatico',
    solicitanteId = null
} = {}) {
    return await executarComLease({
        jobNome: AUTOMACAO_JOB.LEMBRETES_FORNECEDOR,
        origem,
        solicitanteId,
        now,
        logger,
        db,
        executar: ({ executionId }) => processarLembretesDevidosInterno({
            now,
            adapter,
            logger,
            db,
            executionId
        })
    })
}

export function iniciarJobDeLembretesFornecedor({
    intervalMs = Number(process.env.LEMBRETES_FORNECEDOR_JOB_INTERVAL_MS || 60 * 1000),
    logger = console
} = {}) {
    let executando = false
    const intervaloSeguro = Number.isFinite(intervalMs) && intervalMs > 0
        ? intervalMs
        : 60 * 1000

    const executar = async () => {
        if (executando) return null
        executando = true
        try {
            return await processarLembretesDevidos({ logger })
        } catch (error) {
            logger.error?.('Erro no job de lembretes dos fornecedores', error)
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
