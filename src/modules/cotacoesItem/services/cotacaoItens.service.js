import supabase from '../../../config/supabase.js';

// =========================
// LISTAR ITENS DA COTAÇÃO
// =========================
export const listarItensCotacao = async (cotacaoId) => {

    return await supabase
        .from('cotacao_itens')
        .select(`
            *,
            fornecedores:fornecedor_id (
                id,
                razao_social,
                nome_fantasia
            )
        `)
        .eq('cotacao_id', cotacaoId)
        .order('ordem', {
            ascending: true
        });
};

// =========================
// BUSCAR ITEM POR ID
// =========================
export const buscarItemPorId = async (id) => {

    return await supabase
        .from('cotacao_itens')
        .select(`
            *,
            fornecedores:fornecedor_id (
                id,
                razao_social,
                nome_fantasia
            )
        `)
        .eq('id', id)
        .single();
};

// =========================
// INSERIR ITEM
// =========================
export const inserirItemCotacao = async (dados) => {

    return await supabase
        .from('cotacao_itens')
        .insert([dados])
        .select()
        .single();
};

// =========================
// ATUALIZAR ITEM
// =========================
export const atualizarItemCotacao = async (
    id,
    dados
) => {

    return await supabase
        .from('cotacao_itens')
        .update(dados)
        .eq('id', id)
        .select()
        .single();
};

// =========================
// DELETAR ITEM
// =========================
export const deletarItemCotacao = async (id) => {

    return await supabase
        .from('cotacao_itens')
        .delete()
        .eq('id', id);
};