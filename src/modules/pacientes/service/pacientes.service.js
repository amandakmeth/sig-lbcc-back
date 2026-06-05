import supabase from '../../../config/supabase.js'
import { inserirHistorico } from '../../historico_pacientes/services/historico.service.js'

// =========================
// MAPEAMENTO STATUS
// =========================
const mapStatusERSparaBanco = {
    ativo: 'ativo',
    suspenso: 'inativo',
    encerrado: 'alta' // regra: encerrado = alta (poderia ser obito também)
    }

const mapStatusBancoParaERS = {
    ativo: 'ativo',
    inativo: 'suspenso',
    alta: 'encerrado',
    obito: 'encerrado'
    }

// =========================
// LISTAR PACIENTES
// =========================
export const listarPacientes = async () => {
    const { data, error } = await supabase
        .from('pacientes')
        .select('*')
        .order('nome', { ascending: true })

    if (data) {
        data.forEach(p => p.status = mapStatusBancoParaERS[p.status])
    }

    return { data, error }
}

// =========================
// BUSCAR POR ID
// =========================
export const buscarPacientePorId = async (id) => {
    const { data, error } = await supabase
        .from('pacientes')
        .select('*')
        .eq('id', id)
        .maybeSingle()

    if (data) {
        data.status = mapStatusBancoParaERS[data.status]
    }

    return { data, error }
}

// =========================
// CRIAR PACIENTE
// =========================
export const inserirPaciente = async (dados) => {
    if (dados.cpf) {
        const { data: existe } = await supabase
        .from('pacientes')
        .select('id')
        .eq('cpf', dados.cpf)
        .maybeSingle()

        if (existe) {
        return { error: { message: 'CPF já cadastrado' } }
        }
    }

    const { data, error } = await supabase
        .from('pacientes')
        .insert([dados])
        .select('id')
        .single()

    return { data, error }
}

// =========================
// ATUALIZAR PACIENTE
// =========================
export const atualizarPaciente = async (id, dados) => {
    if (!dados || Object.keys(dados).length === 0) {
        return { error: { message: 'Nenhum dado informado para atualização' } }
    }

    if (dados.cpf) {
        const { data: existe } = await supabase
        .from('pacientes')
        .select('id')
        .eq('cpf', dados.cpf)
        .neq('id', id)
        .maybeSingle()

        if (existe) {
        return { error: { message: 'CPF já cadastrado para outro paciente' } }
        }
    }

    const { data, error } = await supabase
        .from('pacientes')
        .update({ ...dados, updated_at: new Date() })
        .eq('id', id)
        .select()

    if (data) {
        data.forEach(p => p.status = mapStatusBancoParaERS[p.status])
    }

    return { data, error }
}

// =========================
// ALTERAR STATUS PACIENTE
// =========================
export const alterarStatusPaciente = async (id, statusERS, usuarioId) => {
    const valoresPermitidos = ['ativo', 'suspenso', 'encerrado']
    if (!valoresPermitidos.includes(statusERS)) {
        return { error: { message: 'Status inválido' } }
    }

    const statusBanco = mapStatusERSparaBanco[statusERS]

    const { data, error } = await supabase
        .from('pacientes')
        .update({ status: statusBanco, updated_at: new Date() })
        .eq('id', id)
        .select()
        .single()

    if (error) return { error }

    if (data) {
        await inserirHistorico({
        paciente_id: id,
        tipo_evento: 'ALTERACAO_STATUS',
        descricao: `Status alterado para ${statusERS}`,
        usuario_id: usuarioId
        })

        data.status = mapStatusBancoParaERS[data.status]
    }

    return { data, error: null }
}

// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
export const verificarRelacionamentosPacienteService = async (id) => {
    const { count: documentos, error } = await supabase
        .from('paciente_documentos')
        .select('*', { count: 'exact', head: true })
        .eq('paciente_id', id)

    if (error) return { error }

    const possuiRelacionamentos = documentos > 0

    return {
        data: {
        possuiRelacionamentos,
        relacionamentos: { documentos }
        }
    }
}

// =========================
// EXCLUIR PACIENTE
// =========================
export const deletarPaciente = async (id) => {
    const { data, error } = await supabase
        .from('pacientes')
        .delete()
        .eq('id', id)
        .select()

    return { data, error }
}
