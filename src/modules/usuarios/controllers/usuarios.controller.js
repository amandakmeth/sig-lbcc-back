import {
    listarUsuarios,
    buscarUsuarioPorId,
    inserirUsuario,
    atualizarUsuario,
    deletarUsuario,
    alterarStatusUsuario,
    verificarRelacionamentosUsuarioService
} from '../services/usuarios.service.js'

// =========================
// LISTAR USUÁRIOS (AJUSTADO)
// =========================
export const getUsuarios = async (req, res) => {
    if (req.user.perfil === 'prefeitura') {
        return res.status(403).json({ erro: 'Sem permissão' })
    }

    const { data: usuarios, error } = await listarUsuarios()

    if (error) {
        return res.status(500).json({ erro: error.message })
    }

    const usuariosComVinculos = await Promise.all(
        usuarios.map(async (usuario) => {
            const { data, error: relError } =
                await verificarRelacionamentosUsuarioService(usuario.id)

            return {
                ...usuario,
                usuarioTemVinculos:
                    relError ? false : (data?.possuiRelacionamentos ?? false)
            }
        })
    )

    return res.json(usuariosComVinculos)
}


// =========================
// BUSCAR POR ID
// =========================
export const getUsuarioById = async (req, res) => {
    const { id } = req.params

    if (req.user.perfil === 'prefeitura') {
        return res.status(403).json({ erro: 'Sem permissão' })
    }

    // operador só pode ver ele mesmo
    if (req.user.perfil === 'operador' && req.user.id !== id) {
        return res.status(403).json({ erro: 'Acesso negado' })
    }

    const { data, error } = await buscarUsuarioPorId(id)

    if (error) {
        return res.status(404).json({ erro: 'Usuário não encontrado' })
    }

    return res.json(data)
}


// =========================
// CRIAR USUÁRIO
// =========================
export const createUsuario = async (req, res) => {
    if (req.user.perfil !== 'gestor') {
        return res.status(403).json({
            erro: 'Apenas gestor pode criar usuários'
        })
    }

    const { nome, email, perfil, senha } = req.body

    if (!nome || !email || !senha) {
        return res.status(400).json({
            erro: 'Nome, email e senha são obrigatórios'
        })
    }

    const { data, error } =
        await inserirUsuario({ nome, email, perfil, senha })

    if (error) {
        return res.status(400).json({
            erro: error?.message || error
        })
    }

    return res.status(201).json(data)
}


// =========================
// ATUALIZAR USUÁRIO
// =========================
export const updateUsuario = async (req, res) => {
    const { id } = req.params

    if (req.user.perfil === 'prefeitura') {
        return res.status(403).json({ erro: 'Sem permissão' })
    }

    if (req.user.perfil === 'operador' && req.user.id !== id) {
        return res.status(403).json({ erro: 'Acesso negado' })
    }

    const { data, error } = await atualizarUsuario(id, req.body)

    if (error) {
        return res.status(500).json({ erro: error.message })
    }

    return res.json(data)
}


// =========================
// ATIVAR / INATIVAR
// =========================
export const toggleStatusUsuario = async (req, res) => {
    if (req.user.perfil !== 'gestor') {
        return res.status(403).json({
            erro: 'Apenas gestor pode alterar status'
        })
    }

    const { id } = req.params
    const { ativo } = req.body

    if (typeof ativo !== 'boolean') {
        return res.status(400).json({
            erro: 'Campo ativo deve ser boolean'
        })
    }

    const { data, error } =
        await alterarStatusUsuario(id, ativo)

    if (error) {
        return res.status(500).json({
            erro: error.message
        })
    }

    return res.json(data)
}


// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
export const verificarRelacionamentosUsuario = async (req, res) => {
    if (req.user.perfil !== 'gestor') {
        return res.status(403).json({
            erro: 'Sem permissão'
        })
    }

    const { id } = req.params

    const { data, error } =
        await verificarRelacionamentosUsuarioService(id)

    if (error) {
        return res.status(500).json({
            erro: error.message
        })
    }

    return res.json(data)
}


// =========================
// DELETAR USUÁRIO
// =========================
export const deleteUsuario = async (req, res) => {
    if (req.user.perfil !== 'gestor') {
        return res.status(403).json({
            erro: 'Apenas gestor pode excluir usuários'
        })
    }

    const { id } = req.params

    const { data: relacionamentos, error: relError } =
        await verificarRelacionamentosUsuarioService(id)

    if (relError) {
        return res.status(500).json({
            erro: relError.message
        })
    }

    if (relacionamentos.possuiRelacionamentos) {
        return res.status(400).json({
            erro: 'Usuário possui vínculos',
            usuarioTemVinculos: true,
            relacionamentos: relacionamentos.relacionamentos
        })
    }

    const { error } = await deletarUsuario(id)

    if (error) {
        return res.status(500).json({
            erro: error?.message || error
        })
    }

    return res.status(200).json({
        message: 'Usuário excluído com sucesso'
    })
}