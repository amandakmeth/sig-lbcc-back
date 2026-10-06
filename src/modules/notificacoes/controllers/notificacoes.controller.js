import {
    listarNotificacoes,
    marcarNotificacaoComoLida,
    arquivarNotificacao
} from '../services/notificacoes.service.js'

export async function listar(req, res) {
    const { data, error } = await listarNotificacoes({
        destinatarioId: req.user.id,
        apenasNaoLidas: req.query.apenas_nao_lidas === 'true',
        incluirArquivadas: req.query.incluir_arquivadas === 'true'
    })

    if (error) return res.status(500).json({ message: error.message })
    return res.json(data || [])
}

export async function marcarComoLida(req, res) {
    const resultado = await marcarNotificacaoComoLida({
        id: req.params.id,
        destinatarioId: req.user.id
    })

    if (resultado.error) {
        const status = resultado.error.message === 'Notificacao nao encontrada' ? 404 : 500
        return res.status(status).json({ message: resultado.error.message })
    }

    return res.json(resultado.data)
}

export async function arquivar(req, res) {
    const resultado = await arquivarNotificacao({
        id: req.params.id,
        destinatarioId: req.user.id
    })

    if (resultado.error) {
        const status = resultado.error.message === 'Notificacao nao encontrada' ? 404 : 500
        return res.status(status).json({ message: resultado.error.message })
    }

    return res.json(resultado.data)
}
