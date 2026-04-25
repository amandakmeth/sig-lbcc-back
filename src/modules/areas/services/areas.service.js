import supabase from '../../../config/supabase.js'

// =========================
// LISTAR ÁREAS (APENAS ATIVAS)
// =========================
export const listarAreas = async (ativo = true) => {
    return await supabase
        .from('areas')
        .select('*')
        .eq('ativo', ativo)
        .order('nome', { ascending: true })
}

// =========================
// BUSCAR ÁREA POR ID
// =========================
export const buscarAreaPorId = async (id) => {
    return await supabase
        .from('areas')
        .select('*')
        .eq('id', id)
        .single()
}

// =========================
// CRIAR ÁREA
// =========================
export const inserirArea = async ({ nome, descricao }) => {

    // verifica duplicidade
    const { data: existe } = await supabase
        .from('areas')
        .select('id')
        .eq('nome', nome)
        .maybeSingle()

    if (existe) {
        return { error: { message: 'Área já cadastrada' } }
    }

    const { data, error } = await supabase
        .from('areas')
        .insert([
            {
                nome,
                descricao
            }
        ])
        .select()

    return { data, error }
}

// =========================
// ATUALIZAR ÁREA
// =========================
export const atualizarArea = async (id, dados) => {

    if (!dados || Object.keys(dados).length === 0) {
        return { error: { message: 'Nenhum dado informado para atualização' } }
    }

    const { data, error } = await supabase
        .from('areas')
        .update(dados)
        .eq('id', id)
        .select()

    return { data, error }
}

// =========================
// DESATIVAR ÁREA (SOFT DELETE)
// =========================
export const desativarArea = async (id) => {

    const { data, error } = await supabase
        .from('areas')
        .update({ ativo: false })
        .eq('id', id)
        .select()

    return { data, error }
}