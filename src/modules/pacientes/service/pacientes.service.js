import supabase from '../../../config/supabase.js'

// =========================
// LISTAR PACIENTES
// =========================
export const listarPacientes = async () => {

    return await supabase
        .from('pacientes')
        .select('*')
        .order('nome', { ascending: true })
}

// =========================
// BUSCAR POR ID
// =========================
export const buscarPacientePorId = async (
    id
) => {

    return await supabase
        .from('pacientes')
        .select('*')
        .eq('id', id)
        .maybeSingle()
}

// =========================
// CRIAR PACIENTE
// =========================
export const inserirPaciente = async (
    dados
) => {

    // VALIDA CPF DUPLICADO
    if (dados.cpf) {

        const { data: existe } = await supabase
            .from('pacientes')
            .select('id')
            .eq('cpf', dados.cpf)
            .maybeSingle()

        if (existe) {

            return {
                error: {
                    message:
                        'CPF já cadastrado'
                }
            }
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
export const atualizarPaciente = async (
    id,
    dados
) => {

    if (
        !dados ||
        Object.keys(dados).length === 0
    ) {

        return {
            error: {
                message:
                    'Nenhum dado informado para atualização'
            }
        }
    }

    // VALIDA CPF DUPLICADO
    if (dados.cpf) {

        const { data: existe } = await supabase
            .from('pacientes')
            .select('id')
            .eq('cpf', dados.cpf)
            .neq('id', id)
            .maybeSingle()

        if (existe) {

            return {
                error: {
                    message:
                        'CPF já cadastrado para outro paciente'
                }
            }
        }
    }

    const { data, error } = await supabase
        .from('pacientes')
        .update({
            ...dados,
            updated_at: new Date()
        })
        .eq('id', id)
        .select()

    return { data, error }
}

// =========================
// ATIVAR / INATIVAR PACIENTE
// =========================
export const alterarStatusPaciente =
    async (
        id,
        status
    ) => {

    const { data, error } = await supabase
        .from('pacientes')
        .update({
            status,
            updated_at: new Date()
        })
        .eq('id', id)
        .select()

    return { data, error }
}

// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
export const verificarRelacionamentosPacienteService =
    async (id) => {

    // DOCUMENTOS DO PACIENTE
    const {
        count: documentos,
        error
    } = await supabase
        .from('paciente_documentos')
        .select('*', {
            count: 'exact',
            head: true
        })
        .eq('paciente_id', id)

    if (error) {

        return { error }
    }

    const possuiRelacionamentos =
        documentos > 0

    return {
        data: {
            possuiRelacionamentos,
            relacionamentos: {
                documentos
            }
        }
    }
}

// =========================
// EXCLUIR PACIENTE
// =========================
export const deletarPaciente = async (
    id
) => {

    const { data, error } = await supabase
        .from('pacientes')
        .delete()
        .eq('id', id)
        .select()

    return { data, error }
}