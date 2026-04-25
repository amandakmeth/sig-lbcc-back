import {
    listarAreas,
    buscarAreaPorId,
    inserirArea,
    atualizarArea,
    desativarArea
} from '../services/areas.service.js'

// =========================
// LISTAR ÁREAS
// =========================
export const getAreas = async (req, res) => {
    try {
        const { data, error } = await listarAreas(true)

        if (error) {
            return res.status(500).json({ erro: error.message })
        }

        res.json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao listar áreas' })
    }
}

// =========================
// BUSCAR POR ID
// =========================
export const getAreaById = async (req, res) => {
    try {
        const { id } = req.params

        const { data, error } = await buscarAreaPorId(id)

        if (error || !data) {
            return res.status(404).json({ erro: 'Área não encontrada' })
        }

        res.json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao buscar área' })
    }
}

// =========================
// CRIAR ÁREA
// =========================
export const createArea = async (req, res) => {
    try {
        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({ erro: 'Apenas gestor pode criar áreas' })
        }

        const { nome, descricao } = req.body

        if (!nome) {
            return res.status(400).json({ erro: 'Nome é obrigatório' })
        }

        const { data, error } = await inserirArea({ nome, descricao })

        if (error) {
            return res.status(400).json({ erro: error.message || error })
        }

        res.status(201).json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao criar área' })
    }
}

// =========================
// ATUALIZAR ÁREA
// =========================
export const updateArea = async (req, res) => {
    try {
        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({ erro: 'Apenas gestor pode atualizar áreas' })
        }

        const { id } = req.params

        const { data, error } = await atualizarArea(id, req.body)

        if (error) {
            return res.status(400).json({ erro: error.message || error })
        }

        res.json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao atualizar área' })
    }
}

// =========================
// DESATIVAR ÁREA
// =========================
export const deleteArea = async (req, res) => {
    try {
        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({ erro: 'Apenas gestor pode desativar áreas' })
        }

        const { id } = req.params

        const { error } = await desativarArea(id)

        if (error) {
            return res.status(500).json({ erro: error.message })
        }

        return res.status(200).json({ message: 'Área desativada' })
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao desativar área' })
    }
}