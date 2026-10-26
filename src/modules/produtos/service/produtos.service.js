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
    unidade,
    areas_ids = []
}) => {
    if (!Array.isArray(areas_ids) || areas_ids.length === 0) {
        return {
            error: {
                message: 'Informe pelo menos uma área para o produto'
            }
        }
    }

    const idsUnicos = [...new Set(areas_ids)]

    if (idsUnicos.some(id => typeof id !== 'string' || !id.trim())) {
        return {
            error: {
                message: 'Lista de áreas inválida'
            }
        }
    }

    const { data: areas, error: erroAreas } = await supabase
        .from('areas')
        .select('id, ativo')
        .in('id', idsUnicos)

    if (erroAreas) {
        return { data: null, error: erroAreas }
    }

    const areasInvalidas = idsUnicos.filter(id =>
        !areas?.some(area => area.id === id && area.ativo)
    )

    if (areasInvalidas.length > 0) {
        return {
            error: {
                message: 'Uma ou mais áreas não existem ou estão inativas'
            }
        }
    }

    const { data: existe, error: erroBusca } = await supabase
        .from('produtos')
        .select('id')
        .eq('nome', nome)
        .maybeSingle()

    if (erroBusca) {
        return { data: null, error: erroBusca }
    }

    if (existe) {
        return {
            error: {
                message: 'Produto já cadastrado'
            }
        }
    }

    const { data: produtos, error: erroProduto } = await supabase
        .from('produtos')
        .insert([{ nome, descricao, unidade }])
        .select()

    if (erroProduto) {
        return { data: null, error: erroProduto }
    }

    const produto = produtos?.[0]

    if (!produto) {
        return {
            error: {
                message: 'Não foi possível recuperar o produto criado'
            }
        }
    }

    const vinculos = idsUnicos.map(area_id => ({
        area_id,
        produto_id: produto.id
    }))

    const { error: erroVinculos } = await supabase
        .from('areas_produtos')
        .insert(vinculos)

    if (erroVinculos) {
        const { error: erroCompensacao } = await supabase
            .from('produtos')
            .delete()
            .eq('id', produto.id)

        return {
            data: null,
            error: {
                message: erroCompensacao
                    ? 'Falha ao vincular as áreas e ao desfazer o cadastro do produto'
                    : 'Falha ao vincular as áreas; o cadastro do produto foi desfeito',
                details: erroVinculos.message
            }
        }
    }

    return {
        data: [{
            ...produto,
            areas_ids: idsUnicos
        }],
        error: null
    }
}


// =========================
// ATUALIZAR PRODUTO
// =========================

export const atualizarProduto = async (id, dados) => {
    if (!dados || Object.keys(dados).length === 0) {
        return {
            error: {
                message: 'Nenhum dado informado para atualização'
            }
        }
    }

    // Separa os vínculos dos campos da tabela produtos
    const { areas_ids, ...dadosProduto } = dados

    // Valida as áreas somente quando areas_ids foi enviado
    let idsUnicos = null

    if (areas_ids !== undefined) {
        if (!Array.isArray(areas_ids) || areas_ids.length === 0) {
            return {
                error: {
                    message: 'Informe pelo menos uma área para o produto'
                }
            }
        }

        idsUnicos = [...new Set(areas_ids)]

        if (idsUnicos.some(idArea =>
            typeof idArea !== 'string' || !idArea.trim()
        )) {
            return {
                error: {
                    message: 'Lista de áreas inválida'
                }
            }
        }

        const { data: areas, error: erroAreas } = await supabase
            .from('areas')
            .select('id, ativo')
            .in('id', idsUnicos)

        if (erroAreas) {
            return { data: null, error: erroAreas }
        }

        const areasInvalidas = idsUnicos.filter(idArea =>
            !areas?.some(area => area.id === idArea && area.ativo)
        )

        if (areasInvalidas.length > 0) {
            return {
                error: {
                    message: 'Uma ou mais áreas não existem ou estão inativas'
                }
            }
        }
    }

    // Verifica duplicidade do nome
    if (dadosProduto.nome) {
        const { data: existe, error: erroBusca } = await supabase
            .from('produtos')
            .select('id')
            .eq('nome', dadosProduto.nome)
            .neq('id', id)
            .maybeSingle()

        if (erroBusca) {
            return { data: null, error: erroBusca }
        }

        if (existe) {
            return {
                error: {
                    message: 'Já existe um produto com este nome'
                }
            }
        }
    }

    // Atualiza os dados do produto, sem enviar areas_ids à tabela
    let produtoAtualizado = null

    if (Object.keys(dadosProduto).length > 0) {
        const { data, error } = await supabase
            .from('produtos')
            .update({
                ...dadosProduto,
                updated_at: new Date()
            })
            .eq('id', id)
            .select()
        
        if (error) {
            return { data: null, error }
        }

        if (!data || data.length === 0) {
            return {
                error: {
                    message: 'Produto não encontrado'
                }
            }
        }

        produtoAtualizado = data[0]
    } else {
        const { data, error } = await supabase
            .from('produtos')
            .select('*')
            .eq('id', id)
            .maybeSingle()

        if (error) {
            return { data: null, error }
        }

        if (!data) {
            return {
                error: {
                    message: 'Produto não encontrado'
                }
            }
        }

        produtoAtualizado = data
    }

    // Atualiza os vínculos somente quando areas_ids foi enviado
    if (idsUnicos !== null) {
        const { data: vinculosAntigos, error: erroConsultaVinculos } =
            await supabase
                .from('areas_produtos')
                .select('area_id')
                .eq('produto_id', id)

        if (erroConsultaVinculos) {
            return { data: null, error: erroConsultaVinculos }
        }

        const { error: erroRemocao } = await supabase
            .from('areas_produtos')
            .delete()
            .eq('produto_id', id)

        if (erroRemocao) {
            return { data: null, error: erroRemocao }
        }

        const novosVinculos = idsUnicos.map(area_id => ({
            area_id,
            produto_id: id
        }))

        const { error: erroInsercao } = await supabase
            .from('areas_produtos')
            .insert(novosVinculos)

        if (erroInsercao) {
            // Tenta restaurar os vínculos anteriores
            if (vinculosAntigos?.length > 0) {
                const restauracao = vinculosAntigos.map(vinculo => ({
                    area_id: vinculo.area_id,
                    produto_id: id
                }))

                await supabase
                    .from('areas_produtos')
                    .insert(restauracao)
            }

            return {
                data: null,
                error: {
                    message: 'Não foi possível atualizar as áreas do produto',
                    details: erroInsercao.message
                }
            }
        }

        produtoAtualizado.areas_ids = idsUnicos
    }

    return {
        data: [produtoAtualizado],
        error: null
    }
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

export const verificarRelacionamentosProdutoService = async (id) => {
    const { data, error } = await supabase
        .from('areas_produtos')
        .select('produto_id')
        .eq('produto_id', id)
        .limit(1)

    if (error) {
        return { data: null, error }
    }

    const possuiRelacionamentos = Array.isArray(data) && data.length > 0

    return {
        data: {
            possuiRelacionamentos,
            relacionamentos: {
                areas_produtos: data
            }
        },
        error: null
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