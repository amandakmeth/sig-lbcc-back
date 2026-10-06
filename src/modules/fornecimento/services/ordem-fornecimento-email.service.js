import { randomUUID } from 'node:crypto'

import supabaseAdmin from '../../../config/supabaseAdmin.js'
import { registrarAuditoria } from '../../historico_pacientes/services/auditoria.service.js'
import { createSmtpAdapter } from '../../notificacoes/services/smtp.adapter.js'
import {
    buildOrderPdf,
    nomeArquivoPdf
} from './ordem-fornecimento-pdf.service.js'

export const ORDEM_ENVIO_STATUS = Object.freeze({
    NAO_ENVIADO: 'nao_enviado',
    PENDENTE: 'pendente',
    ENVIANDO: 'enviando',
    ENVIADO: 'enviado',
    FALHOU_RETENTANDO: 'falhou_retentando',
    FALHOU_DEFINITIVO: 'falhou_definitivo'
})

export const ORDEM_ENVIO_TIPO = Object.freeze({
    AUTOMATICO: 'automatico',
    MANUAL: 'manual'
})

export const MAX_TENTATIVAS_ENVIO = 3
export const ENVIO_TENTATIVA_DELAYS_MS = Object.freeze([
    60 * 1000,
    5 * 60 * 1000,
    30 * 60 * 1000
])

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const ORDEM_ENVIO_SELECT = `
    id,
    ordem_fornecimento_id,
    ciclo,
    tentativa,
    tipo,
    status,
    destinatario_email,
    assunto,
    nome_arquivo,
    pdf_versao,
    message_id,
    erro,
    metadados,
    agendado_em,
    iniciado_em,
    enviado_em,
    falhou_em,
    created_at
`

const ORDEM_EMAIL_SELECT = `
    id,
    numero,
    cotacao_id,
    fornecedor_id,
    status,
    data_emissao,
    data_envio,
    data_previsao_entrega,
    valor_total,
    observacoes,
    fornecedores:fornecedor_id (
        id,
        razao_social,
        nome_fantasia,
        email
    ),
    ordem_fornecimento_itens (
        id,
        descricao,
        quantidade_solicitada,
        unidade,
        valor_unitario,
        valor_total,
        observacoes
    )
`

function toDate(value) {
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

function addMilliseconds(value, milliseconds) {
    const date = toDate(value)
    return date ? new Date(date.getTime() + milliseconds) : null
}

export function calcularProximaTentativa({ agora, tentativa }) {
    const delay = ENVIO_TENTATIVA_DELAYS_MS[tentativa - 1]
    return delay === undefined ? null : addMilliseconds(agora, delay)
}

export function isValidSupplierEmail(value) {
    return typeof value === 'string' && EMAIL_PATTERN.test(value.trim())
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}

function fornecedorNome(ordem) {
    return ordem?.fornecedores?.nome_fantasia
        || ordem?.fornecedores?.razao_social
        || '-'
}

function data(value) {
    if (!value) return '-'
    const [ano, mes, dia] = String(value).slice(0, 10).split('-')
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : String(value)
}

function moeda(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(Number(value || 0))
}

export function buildOrderEmail({ ordem }) {
    const numero = ordem?.numero || ordem?.id || '-'
    const fornecedor = fornecedorNome(ordem)
    const itens = (ordem?.ordem_fornecimento_itens || [])
        .map((item) => `- ${item.descricao || '-'}: ${Number(item.quantidade_solicitada || 0)} ${item.unidade || ''} (${moeda(item.valor_total)})`)
        .join('\n') || '- Nenhum item informado.'

    const text = [
        `Ordem de Fornecimento ${numero}`,
        '',
        `Fornecedor: ${fornecedor}`,
        `Data de emissao: ${data(ordem?.data_emissao)}`,
        `Previsao de entrega: ${data(ordem?.data_previsao_entrega)}`,
        `Valor total: ${moeda(ordem?.valor_total)}`,
        '',
        'Itens:',
        itens,
        ordem?.observacoes ? `\nObservacoes: ${ordem.observacoes}` : '',
        '',
        'A Ordem de Fornecimento segue anexada em PDF.',
        'Responda a este email ou utilize o contato institucional para confirmar o recebimento.'
    ].filter(Boolean).join('\n')

    const itensHtml = (ordem?.ordem_fornecimento_itens || [])
        .map((item) => `<li>${escapeHtml(item.descricao || '-')} — ${escapeHtml(Number(item.quantidade_solicitada || 0))} ${escapeHtml(item.unidade || '')} (${escapeHtml(moeda(item.valor_total))})</li>`)
        .join('') || '<li>Nenhum item informado.</li>'

    const html = [
        `<h2>Ordem de Fornecimento ${escapeHtml(numero)}</h2>`,
        `<p>Fornecedor: <strong>${escapeHtml(fornecedor)}</strong></p>`,
        '<ul>',
        `<li><strong>Data de emissao:</strong> ${escapeHtml(data(ordem?.data_emissao))}</li>`,
        `<li><strong>Previsao de entrega:</strong> ${escapeHtml(data(ordem?.data_previsao_entrega))}</li>`,
        `<li><strong>Valor total:</strong> ${escapeHtml(moeda(ordem?.valor_total))}</li>`,
        '</ul>',
        '<p><strong>Itens:</strong></p>',
        `<ul>${itensHtml}</ul>`,
        ordem?.observacoes ? `<p><strong>Observacoes:</strong> ${escapeHtml(ordem.observacoes)}</p>` : '',
        '<p>A Ordem de Fornecimento segue anexada em PDF.</p>'
    ].filter(Boolean).join('')

    return {
        subject: `Ordem de Fornecimento ${numero}`,
        text,
        html
    }
}

function erroSeguro(error) {
    return {
        message: error?.message || 'Falha nao identificada no envio do e-mail',
        code: error?.code || null,
        statusCode: Number.isFinite(Number(error?.statusCode)) ? Number(error.statusCode) : null
    }
}

function classificarFalha(error) {
    if (error?.code === 'CONTATO_FORNECEDOR_INVALIDO') {
        return { recuperavel: false }
    }

    const statusCode = Number(error?.statusCode)
    if (Number.isFinite(statusCode)) {
        return { recuperavel: statusCode >= 400 && statusCode < 500 }
    }

    return { recuperavel: error?.retryable !== false }
}

async function buscarOrdemParaEmail(ordemId, db = supabaseAdmin) {
    return await db
        .from('ordens_fornecimento')
        .select(ORDEM_EMAIL_SELECT)
        .eq('id', ordemId)
        .maybeSingle()
}

async function buscarEnvioPendente(ordemId, db = supabaseAdmin) {
    return await db
        .from('ordens_fornecimento_envios')
        .select(ORDEM_ENVIO_SELECT)
        .eq('ordem_fornecimento_id', ordemId)
        .eq('status', 'pendente')
        .lte('agendado_em', new Date().toISOString())
        .order('ciclo', { ascending: true })
        .order('tentativa', { ascending: true })
        .limit(1)
        .maybeSingle()
}

async function atualizarOrdemEnvio(ordemId, dados, db = supabaseAdmin) {
    return await db
        .from('ordens_fornecimento')
        .update(dados)
        .eq('id', ordemId)
}

async function registrarAuditoriaEnvio({ envio, ordemId, status, dados = {}, usuarioId = null }) {
    return await registrarAuditoria({
        entidade_tipo: 'ordem_fornecimento_email',
        entidade_id: ordemId,
        acao: `OF_EMAIL_${status.toUpperCase()}`,
        usuario_id: usuarioId,
        dados: {
            envio_id: envio?.id || null,
            ciclo: envio?.ciclo || null,
            tentativa: envio?.tentativa || null,
            tipo: envio?.tipo || null,
            destinatario_email: envio?.destinatario_email || null,
            nome_arquivo: envio?.nome_arquivo || null,
            ...dados
        },
        idempotency_key: `of-email:${envio?.id || ordemId}:${status}`
    })
}

export async function agendarEnvioInicial({
    ordemId,
    agora = new Date(),
    db = supabaseAdmin
}) {
    const now = toDate(agora) || new Date()
    const idempotencyKey = `of:${ordemId}:email:inicial`
    const existente = await db
        .from('ordens_fornecimento_envios')
        .select(ORDEM_ENVIO_SELECT)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()

    if (existente.error) return existente
    if (existente.data) return existente

    const inserido = await db
        .from('ordens_fornecimento_envios')
        .insert([{
            ordem_fornecimento_id: ordemId,
            ciclo: 1,
            tentativa: 1,
            tipo: ORDEM_ENVIO_TIPO.AUTOMATICO,
            status: 'pendente',
            agendado_em: now.toISOString(),
            idempotency_key: idempotencyKey
        }])
        .select(ORDEM_ENVIO_SELECT)
        .maybeSingle()

    if (inserido.error && inserido.error.code !== '23505') return inserido

    const atualizacao = await atualizarOrdemEnvio(ordemId, {
        status_envio: ORDEM_ENVIO_STATUS.PENDENTE,
        email_envio_proxima_tentativa: now.toISOString(),
        email_envio_ultimo_erro: null
    }, db)

    if (atualizacao.error) return { data: null, error: atualizacao.error }
    return inserido.error ? await db
        .from('ordens_fornecimento_envios')
        .select(ORDEM_ENVIO_SELECT)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle() : inserido
}

export async function solicitarReenvioOrdemDeFornecimento({
    ordemId,
    usuarioId,
    agora = new Date(),
    db = supabaseAdmin
}) {
    const ordemResult = await db
        .from('ordens_fornecimento')
        .select('id, numero, status, status_envio')
        .eq('id', ordemId)
        .maybeSingle()

    if (ordemResult.error || !ordemResult.data) {
        return { data: null, error: { code: 'ORDEM_NAO_ENCONTRADA', message: 'Ordem de fornecimento nao encontrada' } }
    }

    if (!['rascunho', 'enviada'].includes(ordemResult.data.status)) {
        return { data: null, error: { code: 'STATUS_INVALIDO', message: 'O email so pode ser enviado antes da confirmacao do recebimento' } }
    }

    const ativo = await db
        .from('ordens_fornecimento_envios')
        .select('id')
        .eq('ordem_fornecimento_id', ordemId)
        .in('status', ['pendente', 'enviando'])
        .limit(1)
        .maybeSingle()

    if (ativo.error) return { data: null, error: ativo.error }
    if (ativo.data) {
        return { data: ativo.data, error: { code: 'ENVIO_EM_ANDAMENTO', message: 'Ja existe um envio em andamento para esta ordem' } }
    }

    const ultimo = await db
        .from('ordens_fornecimento_envios')
        .select('ciclo, tentativa')
        .eq('ordem_fornecimento_id', ordemId)
        .order('ciclo', { ascending: false })
        .order('tentativa', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (ultimo.error) return { data: null, error: ultimo.error }

    const now = toDate(agora) || new Date()
    const ciclo = Number(ultimo.data?.ciclo || 0) + 1
    const idempotencyKey = `of:${ordemId}:email:manual:${ciclo}:${randomUUID()}`
    const inserido = await db
        .from('ordens_fornecimento_envios')
        .insert([{
            ordem_fornecimento_id: ordemId,
            ciclo,
            tentativa: 1,
            tipo: ORDEM_ENVIO_TIPO.MANUAL,
            status: 'pendente',
            agendado_em: now.toISOString(),
            metadados: { usuario_id: usuarioId || null },
            idempotency_key: idempotencyKey
        }])
        .select(ORDEM_ENVIO_SELECT)
        .single()

    if (inserido.error) return inserido

    const atualizacao = await atualizarOrdemEnvio(ordemId, {
        status_envio: ORDEM_ENVIO_STATUS.PENDENTE,
        email_envio_proxima_tentativa: now.toISOString(),
        email_envio_ultimo_erro: null
    }, db)

    if (atualizacao.error) return { data: null, error: atualizacao.error }
    return inserido
}

async function agendarProximaTentativa({ envio, agora, db }) {
    if (envio.tentativa >= MAX_TENTATIVAS_ENVIO) return null

    const proximaData = calcularProximaTentativa({
        agora,
        tentativa: envio.tentativa
    })

    if (!proximaData) return null

    return await db
        .from('ordens_fornecimento_envios')
        .insert([{
            ordem_fornecimento_id: envio.ordem_fornecimento_id,
            ciclo: envio.ciclo,
            tentativa: envio.tentativa + 1,
            tipo: ORDEM_ENVIO_TIPO.AUTOMATICO,
            status: 'pendente',
            agendado_em: proximaData.toISOString(),
            idempotency_key: `of:${envio.ordem_fornecimento_id}:email:ciclo:${envio.ciclo}:tentativa:${envio.tentativa + 1}`
        }])
        .select(ORDEM_ENVIO_SELECT)
        .maybeSingle()
}

export async function processarEnvioOrdemDeFornecimento({
    ordemId,
    agora = new Date(),
    adapter = createSmtpAdapter(),
    db = supabaseAdmin,
    logger = console
}) {
    const now = toDate(agora) || new Date()
    const pendente = await buscarEnvioPendente(ordemId, db)
    if (pendente.error) return { data: null, error: pendente.error }
    if (!pendente.data) return { data: null, error: null, skipped: true, motivo: 'sem_envio_pendente' }

    const claimed = await db
        .from('ordens_fornecimento_envios')
        .update({
            status: 'enviando',
            iniciado_em: now.toISOString()
        })
        .eq('id', pendente.data.id)
        .eq('status', 'pendente')
        .select(ORDEM_ENVIO_SELECT)
        .maybeSingle()

    if (claimed.error) return { data: null, error: claimed.error }
    if (!claimed.data) return { data: null, error: null, skipped: true, motivo: 'envio_assumido_por_outro_processo' }

    const envio = claimed.data
    const ordemResult = await buscarOrdemParaEmail(ordemId, db)
    if (ordemResult.error || !ordemResult.data) {
        const error = ordemResult.error || { message: 'Ordem de fornecimento nao encontrada' }
        await db.from('ordens_fornecimento_envios').update({
            status: 'falhou',
            erro: error.message,
            falhou_em: now.toISOString()
        }).eq('id', envio.id)
        return { data: null, error }
    }

    const ordem = ordemResult.data
    if (!['rascunho', 'enviada'].includes(ordem.status)) {
        const error = { code: 'STATUS_INVALIDO', message: 'A ordem nao pode receber email neste status' }
        await db.from('ordens_fornecimento_envios').update({
            status: 'falhou',
            erro: error.message,
            falhou_em: now.toISOString()
        }).eq('id', envio.id)
        await atualizarOrdemEnvio(ordemId, {
            status_envio: ORDEM_ENVIO_STATUS.FALHOU_DEFINITIVO,
            email_envio_ultimo_erro: error.message,
            email_envio_ultima_tentativa_em: now.toISOString(),
            email_envio_proxima_tentativa: null
        }, db)
        return { data: null, error }
    }

    const email = String(ordem.fornecedores?.email || '').trim().toLowerCase()
    const pdf = buildOrderPdf(ordem)
    const nomeArquivo = nomeArquivoPdf(ordem)
    const emailData = buildOrderEmail({ ordem })
    const pdfBase64 = pdf.toString('base64')

    const pdfPersistido = await db.from('ordens_fornecimento_envios').update({
        destinatario_email: email || null,
        assunto: emailData.subject,
        nome_arquivo: nomeArquivo,
        pdf_versao: Number(envio.ciclo || 1),
        pdf_base64: pdfBase64
    }).eq('id', envio.id)

    if (pdfPersistido.error) {
        const error = {
            code: 'PDF_NAO_PERSISTIDO',
            message: 'Nao foi possivel registrar o PDF do envio'
        }
        const falhouEm = now.toISOString()
        await db.from('ordens_fornecimento_envios').update({
            status: 'falhou',
            erro: error.message,
            falhou_em: falhouEm
        }).eq('id', envio.id)
        await atualizarOrdemEnvio(ordemId, {
            status_envio: ORDEM_ENVIO_STATUS.FALHOU_DEFINITIVO,
            email_envio_ultimo_erro: error.message,
            email_envio_ultima_tentativa_em: falhouEm,
            email_envio_proxima_tentativa: null
        }, db)
        await registrarAuditoriaEnvio({ envio, ordemId, status: 'falhou', dados: { erro: error } })
        return { data: null, error }
    }

    await atualizarOrdemEnvio(ordemId, {
        status_envio: ORDEM_ENVIO_STATUS.ENVIANDO,
        email_envio_tentativas: envio.tentativa,
        email_envio_ultima_tentativa_em: now.toISOString(),
        email_envio_ultimo_erro: null
    }, db)

    if (!isValidSupplierEmail(email)) {
        const error = {
            code: 'CONTATO_FORNECEDOR_INVALIDO',
            message: 'O fornecedor nao possui um email valido cadastrado'
        }
        const falhouEm = now.toISOString()
        await db.from('ordens_fornecimento_envios').update({
            status: 'falhou',
            erro: error.message,
            falhou_em: falhouEm
        }).eq('id', envio.id)
        await atualizarOrdemEnvio(ordemId, {
            status_envio: ORDEM_ENVIO_STATUS.FALHOU_DEFINITIVO,
            email_envio_ultimo_erro: error.message,
            email_envio_ultima_tentativa_em: falhouEm,
            email_envio_proxima_tentativa: null
        }, db)
        await registrarAuditoriaEnvio({ envio, ordemId, status: 'falhou', dados: { erro: error } })
        return { data: null, error }
    }

    try {
        const resultado = await adapter.send({
            to: email,
            from: process.env.SMTP_FROM,
            replyTo: process.env.SMTP_REPLY_TO || process.env.SMTP_FROM,
            subject: emailData.subject,
            text: emailData.text,
            html: emailData.html,
            attachments: [{
                filename: nomeArquivo,
                contentType: 'application/pdf',
                content: pdf
            }]
        })

        const enviadoEm = new Date().toISOString()
        const atualizacaoEnvio = await db.from('ordens_fornecimento_envios').update({
            status: 'enviado',
            message_id: resultado?.messageId || null,
            enviado_em: enviadoEm,
            erro: null,
            metadados: {
                ...(envio.metadados || {}),
                provider: resultado?.provider || 'smtp'
            }
        }).eq('id', envio.id).select(ORDEM_ENVIO_SELECT).maybeSingle()

        if (atualizacaoEnvio.error) return { data: null, error: atualizacaoEnvio.error }

        const dadosOrdem = {
            status_envio: ORDEM_ENVIO_STATUS.ENVIADO,
            email_envio_ultimo_erro: null,
            email_envio_ultima_tentativa_em: enviadoEm,
            email_envio_ultimo_sucesso_em: enviadoEm,
            email_envio_proxima_tentativa: null
        }
        if (ordem.status === 'rascunho') {
            dadosOrdem.status = 'enviada'
            dadosOrdem.data_envio = ordem.data_envio || enviadoEm
        }

        const ordemAtualizada = await db.from('ordens_fornecimento')
            .update(dadosOrdem)
            .eq('id', ordemId)
            .select('id, status, status_envio, data_envio')
            .maybeSingle()

        if (ordemAtualizada.error) return { data: null, error: ordemAtualizada.error }
        await registrarAuditoriaEnvio({
            envio: atualizacaoEnvio.data || envio,
            ordemId,
            status: 'enviado',
            dados: { message_id: resultado?.messageId || null }
        })

        return {
            data: {
                envio: atualizacaoEnvio.data || envio,
                ordem: ordemAtualizada.data
            },
            error: null
        }
    } catch (caughtError) {
        const error = erroSeguro(caughtError)
        const falha = classificarFalha(caughtError)
        const podeTentarNovamente = falha.recuperavel && envio.tentativa < MAX_TENTATIVAS_ENVIO
        const statusEnvio = podeTentarNovamente
            ? ORDEM_ENVIO_STATUS.FALHOU_RETENTANDO
            : ORDEM_ENVIO_STATUS.FALHOU_DEFINITIVO
        const falhouEm = now.toISOString()

        await db.from('ordens_fornecimento_envios').update({
            status: 'falhou',
            erro: error.message,
            falhou_em: falhouEm,
            metadados: {
                ...(envio.metadados || {}),
                codigo_erro: error.code,
                status_code: error.statusCode
            }
        }).eq('id', envio.id)

        const proxima = podeTentarNovamente
            ? await agendarProximaTentativa({ envio, agora: now, db })
            : null

        await atualizarOrdemEnvio(ordemId, {
            status_envio: statusEnvio,
            email_envio_ultimo_erro: error.message,
            email_envio_ultima_tentativa_em: falhouEm,
            email_envio_proxima_tentativa: proxima?.data?.agendado_em || null
        }, db)
        await registrarAuditoriaEnvio({ envio, ordemId, status: 'falhou', dados: { erro: error, retentativa: Boolean(proxima?.data) } })
        logger.error?.('Falha no envio da Ordem de Fornecimento', { ordemId, error })

        return {
            data: null,
            error,
            retryScheduled: Boolean(proxima?.data)
        }
    }
}

export async function processarEnviosPendentes({
    agora = new Date(),
    adapterFactory = () => createSmtpAdapter(),
    db = supabaseAdmin,
    logger = console
} = {}) {
    const now = toDate(agora) || new Date()
    const pendentes = await db
        .from('ordens_fornecimento_envios')
        .select('ordem_fornecimento_id')
        .eq('status', 'pendente')
        .lte('agendado_em', now.toISOString())
        .order('agendado_em', { ascending: true })
        .limit(50)

    if (pendentes.error) throw pendentes.error

    const resumo = { examinados: pendentes.data?.length || 0, enviados: 0, falhas: 0, ignorados: 0 }
    for (const item of pendentes.data || []) {
        const resultado = await processarEnvioOrdemDeFornecimento({
            ordemId: item.ordem_fornecimento_id,
            agora: now,
            adapter: adapterFactory(),
            db,
            logger
        })
        if (resultado.data) resumo.enviados += 1
        else if (resultado.skipped) resumo.ignorados += 1
        else resumo.falhas += 1
    }

    return resumo
}

export function iniciarJobDeEnvioOrdens({
    intervalMs = Number(process.env.ORDENS_FORNECIMENTO_EMAIL_JOB_INTERVAL_MS || 60 * 1000),
    logger = console
} = {}) {
    let executando = false
    const intervaloSeguro = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 60 * 1000

    const executar = async () => {
        if (executando) return null
        executando = true
        try {
            return await processarEnviosPendentes({ logger })
        } catch (error) {
            logger.error?.('Erro no job de envio de Ordens de Fornecimento', error)
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

export async function obterPdfOrdemDeFornecimento({ ordemId, db = supabaseAdmin }) {
    const enviado = await db
        .from('ordens_fornecimento_envios')
        .select('pdf_base64, nome_arquivo, pdf_versao, enviado_em')
        .eq('ordem_fornecimento_id', ordemId)
        .eq('status', 'enviado')
        .not('pdf_base64', 'is', null)
        .order('enviado_em', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (enviado.error) return { data: null, error: enviado.error }
    if (enviado.data?.pdf_base64) {
        return {
            data: {
                buffer: Buffer.from(enviado.data.pdf_base64, 'base64'),
                filename: enviado.data.nome_arquivo,
                origem: 'enviado',
                versao: enviado.data.pdf_versao
            },
            error: null
        }
    }

    const ordem = await buscarOrdemParaEmail(ordemId, db)
    if (ordem.error || !ordem.data) return { data: null, error: ordem.error || { message: 'Ordem de fornecimento nao encontrada' } }

    return {
        data: {
            buffer: buildOrderPdf(ordem.data),
            filename: nomeArquivoPdf(ordem.data),
            origem: 'gerado_atual',
            versao: null
        },
        error: null
    }
}
