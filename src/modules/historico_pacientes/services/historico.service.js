import supabase from '../../../config/supabase.js'

// =========================
// LISTAR HISTÓRICO
// =========================
export const listarHistoricoPaciente = async (pacienteId = null) => {
    let query = supabase
        .from('historico_pacientes')
        .select(`
            *,
            pacientes:paciente_id (
                id,
                nome
            ),
            usuarios:usuario_id (
                id,
                nome,
                email
            )
        `)
        .order('created_at', { ascending: false })

    if (pacienteId) {
        query = query.eq('paciente_id', pacienteId)
    }

    return await query
}

// =========================
// BUSCAR POR ID
// =========================
export const buscarHistoricoPorId = async (id) => {
    return await supabase
        .from('historico_pacientes')
        .select(`
            *,
            pacientes:paciente_id (
                id,
                nome
            ),
            usuarios:usuario_id (
                id,
                nome,
                email
            )
        `)
        .eq('id', id)
        .single()
}

// =========================
// INSERIR HISTÓRICO
// =========================
export const inserirHistorico = async ({
    paciente_id,
    tipo_evento,
    descricao,
    referencia_id = null,
    usuario_id = null
}) => {
    if (!paciente_id || !tipo_evento || !descricao) {
        return {
            error: {
                message: 'Paciente, tipo de evento e descrição são obrigatórios'
            }
        }
    }

    const { data, error } = await supabase
        .from('historico_pacientes')
        .insert([
            {
                paciente_id,
                tipo_evento,
                descricao,
                referencia_id,
                usuario_id
            }
        ])
        .select()

    return { data, error }
}

// =========================
// EXCLUIR HISTÓRICO
// =========================
export const deletarHistorico = async (id) => {
    const { data, error } = await supabase
        .from('historico_pacientes')
        .delete()
        .eq('id', id)
        .select()

    return { data, error }
}
