import {
    listarUsuarios,
    buscarUsuarioPorId,
    inserirUsuario,
    atualizarUsuario,
    deletarUsuario
    } from '../services/usuarios.service.js'

//LISTAR
export const getUsuarios = async (req, res) => {
    const { data, error } = await listarUsuarios()

    if (error) {
        console.error(error)
        return res.status(500).json({ erro: error.message })
    }

    res.json(data)
}

//BUSCAR POR ID
export const getUsuarioById = async (req, res) => {
    const { id } = req.params

    const { data, error } = await buscarUsuarioPorId(id)

    if (error) {
        return res.status(404).json({ erro: 'Usuário não encontrado' })
    }

    res.json(data)
    }

//CRIAR
export const createUsuario = async (req, res) => {
    const { nome, email, perfil } = req.body

    if (!nome || !email) {
        return res.status(400).json({ erro: 'Nome e email são obrigatórios' })
    }

    const { data, error } = await inserirUsuario({ nome, email, perfil })

    if (error) {
        console.error(error)
        return res.status(500).json({ erro: error.message })
    }

    res.status(201).json(data)
}

//ATUALIZAR
export const updateUsuario = async (req, res) => {
    const { id } = req.params

    const { data, error } = await atualizarUsuario(id, req.body)

    if (error) {
        return res.status(500).json({ erro: error.message })
    }

    res.json(data)
}

//DELETAR
export const deleteUsuario = async (req, res) => {
    const { id } = req.params

    const { error } = await deletarUsuario(id)

    if (error) {
        return res.status(500).json({ erro: error.message })
    }

    res.status(204).send()
}