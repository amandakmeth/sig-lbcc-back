import supabase from '../../../config/supabase.js'

// =========================
// LISTAR PRODUTOS
// =========================
export const listarProdutos = async (
    ativo = true
) => {

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
export const inserirProduto = async ({
    nome,
    descricao,
    unidade
}) => {

    // EVITA DUPLICIDADE
    const { data: existe } = await supabase
        .from('produtos')
        .select('id')
        .eq('nome', nome)
        .maybeSingle()

    if (existe) {

        return {
            error: {
                message: 'Produto já cadastrado'
            }
        }
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
export const atualizarProduto = async (
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

    // VERIFICA DUPLICIDADE
    if (dados.nome) {

        const { data: existe } = await supabase
            .from('produtos')
            .select('id')
            .eq('nome', dados.nome)
            .neq('id', id)
            .maybeSingle()

        if (existe) {

            return {
                error: {
                    message:
                        'Já existe um produto com este nome'
                }
            }
        }
    }

    const { data, error } = await supabase
        .from('produtos')
        .update({
            ...dados,
            updated_at: new Date()
        })
        .eq('id', id)
        .select()

    return { data, error }
}

// =========================
// ATIVAR / INATIVAR PRODUTO
// =========================
export const alterarStatusProduto = async (
    id,
    ativo
) => {

    const { data, error } = await supabase
        .from('produtos')
        .update({
            ativo,
            updated_at: new Date()
        })
        .eq('id', id)
        .select()

    return { data, error }
}

// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
export const verificarRelacionamentosProdutoService =
    async (id) => {

    /*
    Atualmente a tabela produtos
    não possui relacionamentos
    */

    return {
        data: {
            possuiRelacionamentos: false,
            relacionamentos: {}
        }
    }
}

// =========================
// EXCLUIR PRODUTO
// =========================
export const deletarProduto = async (id) => {

    const { data, error } = await supabase
        .from('produtos')
        .delete()
        .eq('id', id)
        .select()

    return { data, error }
}