import supabase from '../../../config/supabase.js'

export const NOTIFICACAO_TIPO = Object.freeze({
    OF_PROXIMA_EXPIRACAO: 'OF_PROXIMA_EXPIRACAO'
})

const NOTIFICACAO_SELECT = `
    id,
    destinatario_id,
    tipo,
    titulo,
    mensagem,
    link,
    dados,
    ordem_fornecimento_id,
    prazo_ciclo,
    data_limite,
    status_prazo,
    idempotency_key,
    lida_em,
    arquivada_em,
    created_at,
    updated_at
`

export async function criarNotificacaoInterna({
    destinatarioId,
    tipo,
    titulo,
    mensagem,
    link = null,
    dados = {},
    ordemFornecimentoId = null,
    prazoCiclo = null,
    dataLimite = null,
    statusPrazo = null,
    idempotencyKey = null
}) {
    const registro = {
        destinatario_id: destinatarioId,
        tipo,
        titulo,
        mensagem,
        link,
        dados,
        ordem_fornecimento_id: ordemFornecimentoId,
        prazo_ciclo: prazoCiclo,
        data_limite: dataLimite,
        status_prazo: statusPrazo,
        idempotency_key: idempotencyKey
    }

    const query = supabase.from('notificacoes_internas')
    return await (idempotencyKey
        ? query.upsert([registro], {
            onConflict: 'idempotency_key',
            ignoreDuplicates: true
        })
        : query.insert([registro]))
        .select(NOTIFICACAO_SELECT)
        .maybeSingle()
}

export async function listarNotificacoes({
    destinatarioId,
    apenasNaoLidas = false,
    incluirArquivadas = false
}) {
    let query = supabase
        .from('notificacoes_internas')
        .select(NOTIFICACAO_SELECT)
        .eq('destinatario_id', destinatarioId)
        .order('created_at', { ascending: false })

    if (!incluirArquivadas) query = query.is('arquivada_em', null)
    if (apenasNaoLidas) query = query.is('lida_em', null)

    return await query
}

async function obterNotificacaoDoDestinatario(id, destinatarioId) {
    return await supabase
        .from('notificacoes_internas')
        .select(NOTIFICACAO_SELECT)
        .eq('id', id)
        .eq('destinatario_id', destinatarioId)
        .maybeSingle()
}

export async function marcarNotificacaoComoLida({ id, destinatarioId }) {
    const atual = await obterNotificacaoDoDestinatario(id, destinatarioId)
    if (atual.error || !atual.data) {
        return { data: null, error: { message: 'Notificacao nao encontrada' } }
    }

    if (atual.data.lida_em) return atual

    return await supabase
        .from('notificacoes_internas')
        .update({
            lida_em: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('destinatario_id', destinatarioId)
        .select(NOTIFICACAO_SELECT)
        .single()
}

export async function arquivarNotificacao({ id, destinatarioId }) {
    const atual = await obterNotificacaoDoDestinatario(id, destinatarioId)
    if (atual.error || !atual.data) {
        return { data: null, error: { message: 'Notificacao nao encontrada' } }
    }

    if (atual.data.arquivada_em) return atual

    const agora = new Date().toISOString()
    return await supabase
        .from('notificacoes_internas')
        .update({
            arquivada_em: agora,
            updated_at: agora
        })
        .eq('id', id)
        .eq('destinatario_id', destinatarioId)
        .select(NOTIFICACAO_SELECT)
        .single()
}

export function montarChaveDeNotificacao({ ordemId, ciclo, destinatarioId }) {
    return `of:${ordemId}:ciclo:${ciclo}:destinatario:${destinatarioId}`
}
