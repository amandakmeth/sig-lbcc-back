import {
    listarUsuarios,
    buscarUsuarioPorId,
    inserirUsuario,
    atualizarUsuario,
    deletarUsuario
    } from '../services/usuarios.service.js'

//LISTAR
export const getUsuarios = async (req, res) => {
    if (req.user.perfil === 'prefeitura') {
        return res.status(403).json({ erro: 'Sem permissão' })
    }

    const { data, error } = await listarUsuarios()

    if (error) {
        return res.status(500).json({ erro: error.message })
    }

    res.json(data)
}


//BUSCAR POR ID
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

    res.json(data)
}

//CRIAR
export const createUsuario = async (req, res) => {
    if (req.user.perfil !== 'gestor') {
        return res.status(403).json({ erro: 'Apenas gestor pode criar usuários' })
    }

    const { nome, email, perfil, senha } = req.body

    if (!nome || !email || !senha) {
        return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios' })
    }

    const { data, error } = await inserirUsuario({ nome, email, perfil, senha })

    if (error) {
        return res.status(500).json({ erro: error.message })
    }

    res.status(201).json(data)
}

//ATUALIZAR
export const updateUsuario = async (req, res) => {
    const { id } = req.params

    // prefeitura não pode
    if (req.user.perfil === 'prefeitura') {
        return res.status(403).json({ erro: 'Sem permissão' })
    }

    // operador só pode atualizar ele mesmo
    if (req.user.perfil === 'operador' && req.user.id !== id) {
        return res.status(403).json({ erro: 'Acesso negado' })
    }

    const { data, error } = await atualizarUsuario(id, req.body)

    if (error) {
        return res.status(500).json({ erro: error.message })
    }

    res.json(data)
}

//DELETAR
export const deleteUsuario = async (req, res) => {
    if (req.user.perfil !== 'gestor') {
        return res.status(403).json({ erro: 'Apenas gestor pode excluir' })
    }

    const { id } = req.params

    const { error } = await deletarUsuario(id)

    if (error) {
        return res.status(500).json({
            erro: error?.message || error
        })
    }

    return res.status(200).json({ message: 'Usuário deletado' })
}