import supabase from '../../../config/supabase.js'

// =========================
// LISTAR PACIENTES
// =========================
export const listarPacientes = async () => {
    return await supabase
        .from('pacientes')
        .select('*')
        .order('created_at', { ascending: false })
}

// =========================
// BUSCAR POR ID
// =========================
export const buscarPacientePorId = async (id) => {
    return await supabase
        .from('pacientes')
        .select('*')
        .eq('id', id)
        .single()
}

// =========================
// CRIAR PACIENTE
// =========================
export const inserirPaciente = async (dados) => {

    // valida CPF duplicado
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
        .select()

    return { data, error }
}

// =========================
// ATUALIZAR PACIENTE
// =========================
export const atualizarPaciente = async (id, dados) => {

    if (!dados || Object.keys(dados).length === 0) {
        return { error: { message: 'Nenhum dado informado para atualização' } }
    }

    const { data, error } = await supabase
        .from('pacientes')
        .update(dados)
        .eq('id', id)
        .select()

    return { data, error }
}

// =========================
// INATIVAR PACIENTE
// =========================
export const desativarPaciente = async (id) => {

    const { data, error } = await supabase
        .from('pacientes')
        .update({ status: 'inativo' })
        .eq('id', id)
        .select()

    return { data, error }
}