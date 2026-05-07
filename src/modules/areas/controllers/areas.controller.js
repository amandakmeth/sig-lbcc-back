import {
    listarAreas,
    buscarAreaPorId,
    inserirArea,
    atualizarArea
} from '../services/areas.service.js'
import supabase from '../../../config/supabase.js'

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
// EXCLUIR ÁREA
// =========================
export const deleteArea = async (req, res) => {
    try {

        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({
                erro: 'Apenas gestor pode excluir áreas'
            })
        }

        const { id } = req.params

        // verificar vínculos
        const { data: usuarios } = await supabase
            .from('usuarios')
            .select('id')
            .eq('area_id', id)
            .limit(1)

        if (usuarios && usuarios.length > 0) {
            return res.status(400).json({
                erro: 'Área possui usuários vinculados'
            })
        }

        // exclusão física
        const { error } = await supabase
            .from('areas')
            .delete()
            .eq('id', id)

        if (error) {
            return res.status(500).json({
                erro: error.message
            })
        }

        return res.status(200).json({
            message: 'Área excluída com sucesso'
        })

    } catch (err) {
        return res.status(500).json({
            erro: 'Erro ao excluir área'
        })
    }
}