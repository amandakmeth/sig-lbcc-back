import {
    listarHistoricoPaciente,
    buscarHistoricoPorId,
    inserirHistorico,
    deletarHistorico
} from '../services/historico.service.js'

// =========================
// LISTAR HISTÓRICO
// =========================
export const getHistoricoPacientes = async (
    req,
    res
) => {

    try {

        const {
            paciente_id
        } = req.query

        const { data, error } =
            await listarHistoricoPaciente(
                paciente_id
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
                'Erro ao listar histórico'
        })
    }
}

// =========================
// BUSCAR POR ID
// =========================
export const getHistoricoById = async (
    req,
    res
) => {

    try {

        const { id } = req.params

        const { data, error } =
            await buscarHistoricoPorId(id)

        if (error || !data) {

            return res.status(404).json({
                erro:
                    'Registro de histórico não encontrado'
            })
        }

        return res.json(data)

    } catch (err) {

        return res.status(500).json({
            erro:
                'Erro ao buscar histórico'
        })
    }
}

// =========================
// CRIAR REGISTRO
// =========================
export const createHistorico = async (
    req,
    res
) => {

    try {

        const {
            paciente_id,
            tipo_evento,
            descricao
        } = req.body

        if (
            !paciente_id ||
            !tipo_evento ||
            !descricao
        ) {

            return res.status(400).json({
                erro:
                    'Paciente, tipo de evento e descrição são obrigatórios'
            })
        }

        const { data, error } =
            await inserirHistorico({
                ...req.body,
                usuario_id:
                    req.user.id
            })

        if (error) {

            return res.status(400).json({
                erro:
                    error.message || error
            })
        }

        return res.status(201).json(data)

    } catch (err) {

        return res.status(500).json({
            erro:
                'Erro ao registrar histórico'
        })
    }
}

// =========================
// EXCLUIR REGISTRO
// =========================
export const deleteHistorico = async (
    req,
    res
) => {

    try {

        if (
            req.user.perfil !== 'gestor'
        ) {

            return res.status(403).json({
                erro:
                    'Apenas gestor pode excluir registros do histórico'
            })
        }

        const { id } = req.params

        const { error } =
            await deletarHistorico(id)

        if (error) {

            return res.status(500).json({
                erro:
                    error.message
            })
        }

        return res.status(200).json({
            message:
                'Registro removido com sucesso'
        })

    } catch (err) {

        return res.status(500).json({
            erro:
                'Erro ao excluir registro do histórico'
        })
    }
}