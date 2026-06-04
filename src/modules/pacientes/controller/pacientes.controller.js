import {
    listarPacientes,
    buscarPacientePorId,
    inserirPaciente,
    atualizarPaciente,
    alterarStatusPaciente,
    deletarPaciente,
    verificarRelacionamentosPacienteService
} from '../service/pacientes.service.js'

// =========================
// LISTAR PACIENTES
// =========================
export const getPacientes = async (
    req,
    res
) => {

    try {

        const { data, error } =
            await listarPacientes()

        if (error) {

            return res.status(500).json({
                erro: error.message
            })
        }

        res.json(data)

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao listar pacientes'
        })
    }
}

// =========================
// BUSCAR POR ID
// =========================
export const getPacienteById = async (
    req,
    res
) => {

    try {

        const { id } = req.params

        const { data, error } =
            await buscarPacientePorId(id)

        if (error || !data) {

            return res.status(404).json({
                erro:
                    'Paciente não encontrado'
            })
        }

        res.json(data)

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao buscar paciente'
        })
    }
}

// =========================
// CRIAR PACIENTE
// =========================
export const createPaciente = async (req, res) => {
    try {

        const { nome, data_nascimento } = req.body

        if (!nome || !data_nascimento) {
            return res.status(400).json({
                erro: 'Nome e data de nascimento são obrigatórios'
            })
        }

        const { data, error } = await inserirPaciente({
            ...req.body,
            created_by: req.user.id
        })

        if (error) {
            return res.status(400).json({
                erro: error.message || error
            })
        }

        res.status(201).json(data)

    } catch (err) {
        return res.status(500).json({
            erro: 'Erro ao criar paciente'
        })
    }
}

// =========================
// ATUALIZAR PACIENTE
// =========================
export const updatePaciente = async (req, res) => {
    try {

        const { id } = req.params

        const { data, error } = await atualizarPaciente(
            id,
            {
                ...req.body,
                updated_by: req.user.id
            }
        )

        if (error) {
            return res.status(400).json({
                erro: error.message || error
            })
        }

        res.json(data)

    } catch (err) {
        return res.status(500).json({
            erro: 'Erro ao atualizar paciente'
        })
    }
}

// =========================
// ATIVAR / INATIVAR PACIENTE
// =========================
export const toggleStatusPaciente =
    async (req, res) => {

    try {

        const { id } = req.params
        const { status } = req.body

        if (!status) {

            return res.status(400).json({
                erro:
                    'Campo status é obrigatório'
            })
        }

        const { data, error } =
            await alterarStatusPaciente(
                id,
                status
            )

        if (error) {

            return res.status(500).json({
                erro: error.message
            })
        }

        return res.json(data)

    } catch (err) {

        return res.status(500).json({
            erro:
                'Erro ao alterar status do paciente'
        })
    }
}

// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
export const verificarRelacionamentosPaciente =
    async (req, res) => {

    try {

        const { id } = req.params

        const { data, error } =
            await verificarRelacionamentosPacienteService(id)

        if (error) {

            return res.status(500).json({
                erro: error.message
            })
        }

        return res.json(data)

    } catch (err) {

        return res.status(500).json({
            erro:
                'Erro ao verificar relacionamentos'
        })
    }
}

// =========================
// EXCLUIR PACIENTE
// =========================
export const deletePaciente = async (
    req,
    res
) => {

    try {

        const { id } = req.params

        const {
            data: relacionamentos,
            error: relError
        } =
            await verificarRelacionamentosPacienteService(id)

        if (relError) {

            return res.status(500).json({
                erro: relError.message
            })
        }

        if (
            relacionamentos.possuiRelacionamentos
        ) {

            return res.status(400).json({
                erro:
                    'Paciente possui vínculos',
                possuiRelacionamentos: true
            })
        }

        const { error } =
            await deletarPaciente(id)

        if (error) {

            return res.status(500).json({
                erro: error.message
            })
        }

        return res.status(200).json({
            message:
                'Paciente excluído com sucesso'
        })

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao excluir paciente'
        })
    }
}