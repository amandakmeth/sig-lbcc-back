import {
    listarAtendimentos,
    buscarAtendimentoPorId,
    inserirAtendimento,
    atualizarAtendimento,
    deletarAtendimento,
    verificarRelacionamentosAtendimentoService
} from '../services/atendimentos.service.js'

import { inserirHistorico } from '../../historico_pacientes/services/historico.service.js'

// =========================
// LISTAR ATENDIMENTOS
// =========================
export const getAtendimentos = async (req, res) => {
    try {
        const { data, error } = await listarAtendimentos()
        if (error) return res.status(500).json({ erro: error.message })
        return res.json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao listar atendimentos' })
    }
}

// =========================
// BUSCAR POR ID
// =========================
export const getAtendimentoById = async (req, res) => {
    try {
        const { id } = req.params
        const { data, error } = await buscarAtendimentoPorId(id)
        if (error || !data) return res.status(404).json({ erro: 'Atendimento não encontrado' })
        return res.json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao buscar atendimento' })
    }
}

// =========================
// CRIAR ATENDIMENTO
// =========================
export const createAtendimento = async (req, res) => {
    try {
        const { paciente_id, tipo, data_atendimento, descricao } = req.body
        if (!paciente_id || !tipo || !data_atendimento || !descricao) {
            return res.status(400).json({ erro: 'Paciente, tipo, data e descrição são obrigatórios' })
        }

        const { data, error } = await inserirAtendimento({
            ...req.body,
            created_by: req.user.id
        })
        if (error) return res.status(400).json({ erro: error.message || error })

        try {
            const atendimentoCriado = Array.isArray(data) ? data[0] : data
            if (atendimentoCriado?.id) {
                await inserirHistorico({
                    paciente_id,
                    tipo_evento: 'ATENDIMENTO',
                    descricao,
                    referencia_id: atendimentoCriado.id,
                    usuario_id: req.user?.id || null
                })
            }
        } catch (histErr) {
            console.error('Erro ao inserir histórico (create):', histErr)
        }

        return res.status(201).json(data)
    } catch (err) {
        console.error('Erro ao criar atendimento:', err)
        return res.status(500).json({ erro: 'Erro ao criar atendimento' })
    }
}

// =========================
// ATUALIZAR ATENDIMENTO
// =========================
export const updateAtendimento = async (req, res) => {
    try {
        const { id } = req.params
        const { data, error } = await atualizarAtendimento(id, {
            ...req.body,
            updated_by: req.user.id
        })
        if (error) return res.status(400).json({ erro: error.message || error })

        try {
            const atendimentoAtualizado = Array.isArray(data) ? data[0] : data
            if (atendimentoAtualizado?.paciente_id) {
                await inserirHistorico({
                    paciente_id: atendimentoAtualizado.paciente_id,
                    tipo_evento: 'ALTERACAO_STATUS',
                    descricao: 'Atendimento atualizado',
                    referencia_id: id,
                    usuario_id: req.user?.id || null
                })
            }
        } catch (histErr) {
            console.error('Erro ao inserir histórico (update):', histErr)
        }

        return res.json(data)
    } catch (err) {
        console.error('Erro ao atualizar atendimento:', err)
        return res.status(500).json({ erro: 'Erro ao atualizar atendimento' })
    }
}

// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
export const verificarRelacionamentosAtendimento = async (req, res) => {
    try {
        if (req.user.perfil !== 'gestor') return res.status(403).json({ erro: 'Sem permissão' })
        const { id } = req.params
        const { data, error } = await verificarRelacionamentosAtendimentoService(id)
        if (error) return res.status(500).json({ erro: error.message })
        return res.json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao verificar relacionamentos' })
    }
}

// =========================
// EXCLUIR ATENDIMENTO
// =========================
export const deleteAtendimento = async (req, res) => {
    try {
        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({ erro: 'Apenas gestor pode excluir atendimentos' })
        }

        const { id } = req.params

        const { data: relacionamentos, error: relError } =
            await verificarRelacionamentosAtendimentoService(id)
        if (relError) return res.status(500).json({ erro: relError.message })

        if (relacionamentos?.possuiRelacionamentos) {
            return res.status(400).json({
                erro: 'Atendimento possui vínculos',
                possuiRelacionamentos: true,
                relacionamentos: relacionamentos.relacionamentos
            })
        }

        // 🔎 Buscar atendimento antes de excluir
        const { data: atendimento, error: buscaError } = await buscarAtendimentoPorId(id)
        if (buscaError || !atendimento) {
            return res.status(404).json({ erro: 'Atendimento não encontrado para exclusão' })
        }

        // ✅ Registrar no histórico ANTES de excluir
        try {
            await inserirHistorico({
                paciente_id: atendimento.paciente_id,
                tipo_evento: 'ATENDIMENTO_REMOVIDO',
                descricao: 'Atendimento excluído',
                referencia_id: id,
                usuario_id: req.user?.id || null
            })
        } catch (histErr) {
            console.error('Erro ao inserir histórico (delete):', histErr)
        }

        // Agora excluir
        const { error } = await deletarAtendimento(id)
        if (error) return res.status(500).json({ erro: error.message })

        return res.status(200).json({ message: 'Atendimento excluído com sucesso' })
    } catch (err) {
        console.error('Erro ao excluir atendimento:', err)
        return res.status(500).json({ erro: 'Erro ao excluir atendimento' })
    }
}

