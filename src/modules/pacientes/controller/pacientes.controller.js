import {
    listarPacientes,
    buscarPacientePorId,
    inserirPaciente,
    atualizarPaciente,
    desativarPaciente
} from '../service/pacientes.service.js'

// =========================
// LISTAR PACIENTES
// =========================
export const getPacientes = async (req, res) => {
    try {
        const { data, error } = await listarPacientes()

        if (error) {
            return res.status(500).json({ erro: error.message })
        }

        res.json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao listar pacientes' })
    }
}

// =========================
// BUSCAR POR ID
// =========================
export const getPacienteById = async (req, res) => {
    try {
        const { id } = req.params

        const { data, error } = await buscarPacientePorId(id)

        if (error || !data) {
            return res.status(404).json({ erro: 'Paciente não encontrado' })
        }

        res.json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao buscar paciente' })
    }
}

// =========================
// CRIAR PACIENTE
// =========================
export const createPaciente = async (req, res) => {
    try {
        const { nome, data_nascimento, cidade, estado } = req.body

        if (!nome || !data_nascimento) {
            return res.status(400).json({ erro: 'Nome e data de nascimento são obrigatórios' })
        }

        const { data, error } = await inserirPaciente(req.body)

        if (error) {
            return res.status(400).json({ erro: error.message || error })
        }

        res.status(201).json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao criar paciente' })
    }
}

// =========================
// ATUALIZAR PACIENTE
// =========================
export const updatePaciente = async (req, res) => {
    try {
        const { id } = req.params

        const { data, error } = await atualizarPaciente(id, req.body)

        if (error) {
            return res.status(400).json({ erro: error.message || error })
        }

        res.json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao atualizar paciente' })
    }
}

// =========================
// "DELETAR" (ALTERAR STATUS)
// =========================
export const deletePaciente = async (req, res) => {
    try {
        const { id } = req.params

        const { error } = await desativarPaciente(id)

        if (error) {
            return res.status(500).json({ erro: error.message })
        }

        return res.status(200).json({ message: 'Paciente inativado' })
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao inativar paciente' })
    }
}