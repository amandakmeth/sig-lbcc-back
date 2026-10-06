import {
    listarFeriados,
    buscarFeriado,
    inserirFeriado,
    atualizarFeriado,
    alterarStatusFeriado
} from '../services/calendario.service.js'
import { registrarAuditoria } from '../../historico_pacientes/services/auditoria.service.js'
import { toDateOnly } from '../../fornecimento/services/prazo.utils.js'

function ehGestor(req) {
    return req.user?.perfil === 'gestor'
}

function validarDados({ data, nome }, exigirData = true) {
    if (exigirData && !toDateOnly(data)) {
        return 'A data do feriado deve estar no formato AAAA-MM-DD'
    }

    if (data !== undefined && data !== null && !toDateOnly(data)) {
        return 'A data do feriado deve estar no formato AAAA-MM-DD'
    }

    if (nome !== undefined && (!String(nome).trim() || String(nome).trim().length > 160)) {
        return 'O nome do feriado deve ter entre 1 e 160 caracteres'
    }

    return null
}

async function auditar({ acao, feriado, usuarioId, antes = null }) {
    const resultado = await registrarAuditoria({
        entidade_tipo: 'calendario_feriado',
        entidade_id: feriado?.id,
        acao,
        usuario_id: usuarioId,
        dados: {
            antes,
            depois: feriado
        }
    })

    if (resultado.error) console.error('Falha ao auditar feriado:', resultado.error)
}

export async function getFeriados(req, res) {
    const { data, error } = await listarFeriados()
    if (error) return res.status(500).json({ erro: error.message })
    return res.json(data)
}

export async function getFeriado(req, res) {
    const { data, error } = await buscarFeriado(req.params.id)
    if (error || !data) return res.status(404).json({ erro: 'Feriado nao encontrado' })
    return res.json(data)
}

export async function createFeriado(req, res) {
    if (!ehGestor(req)) return res.status(403).json({ erro: 'Apenas gestor pode alterar o calendario' })

    const { data, nome } = req.body || {}
    const validacao = validarDados({ data, nome })
    if (validacao || !String(nome || '').trim()) {
        return res.status(400).json({ erro: validacao || 'Nome do feriado e obrigatorio' })
    }

    const resultado = await inserirFeriado({
        data: toDateOnly(data),
        nome: String(nome).trim(),
        usuarioId: req.user.id
    })

    if (resultado.error) return res.status(400).json({ erro: resultado.error.message })

    await auditar({
        acao: 'FERIADO_CRIADO',
        feriado: resultado.data,
        usuarioId: req.user.id
    })

    return res.status(201).json(resultado.data)
}

export async function updateFeriado(req, res) {
    if (!ehGestor(req)) return res.status(403).json({ erro: 'Apenas gestor pode alterar o calendario' })

    const atual = await buscarFeriado(req.params.id)
    if (atual.error || !atual.data) return res.status(404).json({ erro: 'Feriado nao encontrado' })

    const validacao = validarDados(req.body || {}, false)
    if (validacao) return res.status(400).json({ erro: validacao })

    const body = req.body || {}
    const resultado = await atualizarFeriado({
        id: req.params.id,
        data: body.data === undefined ? undefined : toDateOnly(body.data),
        nome: body.nome === undefined ? undefined : String(body.nome).trim(),
        usuarioId: req.user.id
    })

    if (resultado.error) return res.status(400).json({ erro: resultado.error.message })

    await auditar({
        acao: 'FERIADO_EDITADO',
        feriado: resultado.data,
        antes: atual.data,
        usuarioId: req.user.id
    })

    return res.json(resultado.data)
}

export async function patchStatusFeriado(req, res) {
    if (!ehGestor(req)) return res.status(403).json({ erro: 'Apenas gestor pode alterar o calendario' })

    const atual = await buscarFeriado(req.params.id)
    if (atual.error || !atual.data) return res.status(404).json({ erro: 'Feriado nao encontrado' })

    const ativo = req.body?.ativo === undefined
        ? !atual.data.ativo
        : req.body.ativo

    if (typeof ativo !== 'boolean') {
        return res.status(400).json({ erro: 'O campo ativo deve ser booleano' })
    }

    const resultado = await alterarStatusFeriado({
        id: req.params.id,
        ativo,
        usuarioId: req.user.id
    })

    if (resultado.error) return res.status(400).json({ erro: resultado.error.message })

    await auditar({
        acao: ativo ? 'FERIADO_ATIVADO' : 'FERIADO_INATIVADO',
        feriado: resultado.data,
        antes: atual.data,
        usuarioId: req.user.id
    })

    return res.json(resultado.data)
}

