import supabase from '../../../config/supabase.js'

// =========================
// LISTAR PRODUTOS
// =========================
export const listarProdutos = async (ativo = true) => {
    return await supabase
        .from('produtos')
        .select('*')
        .eq('ativo', ativo)
        .order('nome', { ascending: true })
}

// =========================
// BUSCAR POR ID
// =========================
export const buscarProdutoPorId = async (id) => {
    return await supabase
        .from('produtos')
        .select('*')
        .eq('id', id)
        .single()
}

// =========================
// CRIAR PRODUTO
// =========================
export const inserirProduto = async ({ nome, descricao, unidade }) => {

    // evita duplicado
    const { data: existe } = await supabase
        .from('produtos')
        .select('id')
        .eq('nome', nome)
        .maybeSingle()

    if (existe) {
        return { error: { message: 'Produto já cadastrado' } }
    }

    const { data, error } = await supabase
        .from('produtos')
        .insert([
            {
                nome,
                descricao,
                unidade
            }
        ])
        .select()

    return { data, error }
}

// =========================
// ATUALIZAR PRODUTO
// =========================
export const atualizarProduto = async (id, dados) => {

    if (!dados || Object.keys(dados).length === 0) {
        return { error: { message: 'Nenhum dado informado para atualização' } }
    }

    const { data, error } = await supabase
        .from('produtos')
        .update(dados)
        .eq('id', id)
        .select()

    return { data, error }
}

// =========================
// DESATIVAR PRODUTO
// =========================
export const desativarProduto = async (id) => {

    const { data, error } = await supabase
        .from('produtos')
        .update({ ativo: false })
        .eq('id', id)
        .select()

    return { data, error }
}