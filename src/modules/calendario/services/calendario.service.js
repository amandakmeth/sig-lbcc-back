import supabase from '../../../config/supabase.js'

const CAMPOS = 'id, data, nome, ativo, criado_por, atualizado_por, created_at, updated_at'

export async function listarFeriados() {
    return await supabase
        .from('calendario_feriados')
        .select(CAMPOS)
        .order('data', { ascending: true })
}

export async function buscarFeriado(id) {
    return await supabase
        .from('calendario_feriados')
        .select(CAMPOS)
        .eq('id', id)
        .single()
}

export async function inserirFeriado({ data, nome, usuarioId }) {
    return await supabase
        .from('calendario_feriados')
        .insert([{
            data,
            nome,
            ativo: true,
            criado_por: usuarioId,
            atualizado_por: usuarioId
        }])
        .select(CAMPOS)
        .single()
}

export async function atualizarFeriado({ id, data, nome, usuarioId }) {
    const alteracoes = {
        atualizado_por: usuarioId,
        updated_at: new Date().toISOString()
    }

    if (data !== undefined) alteracoes.data = data
    if (nome !== undefined) alteracoes.nome = nome

    return await supabase
        .from('calendario_feriados')
        .update(alteracoes)
        .eq('id', id)
        .select(CAMPOS)
        .single()
}

export async function alterarStatusFeriado({ id, ativo, usuarioId }) {
    return await supabase
        .from('calendario_feriados')
        .update({
            ativo,
            atualizado_por: usuarioId,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(CAMPOS)
        .single()
}

export async function listarDatasFeriadosAtivos() {
    return await supabase
        .from('calendario_feriados')
        .select('data')
        .eq('ativo', true)
}

