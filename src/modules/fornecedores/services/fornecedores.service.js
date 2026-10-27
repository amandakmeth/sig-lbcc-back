import supabase from '../../../config/supabase.js'


/* =========================
   CONSULTAR PRODUTOS VINCULADOS
========================= */
const anexarProdutosIds = async (fornecedores) => {
    if (!fornecedores || fornecedores.length === 0) {
        return { data: fornecedores, error: null }
    }

    const fornecedoresIds = fornecedores.map(f => f.id)

    const { data: vinculos, error } = await supabase
        .from('fornecedores_produtos')
        .select('fornecedor_id, produto_id')
        .in('fornecedor_id', fornecedoresIds)

    if (error) {
        return { data: null, error }
    }

    const produtosPorFornecedor = new Map(
        fornecedoresIds.map(id => [id, []])
    )

    for (const vinculo of vinculos ?? []) {
        produtosPorFornecedor
            .get(vinculo.fornecedor_id)
            ?.push(vinculo.produto_id)
    }

    const fornecedoresComProdutos = fornecedores.map(fornecedor => ({
        ...fornecedor,
        produtos_ids: produtosPorFornecedor.get(fornecedor.id) ?? []
    }))

    return { data: fornecedoresComProdutos, error: null }
}

// =========================
// LISTAR FORNECEDORES
// =========================
export const listarFornecedores = async () => {
    const { data, error } = await supabase
        .from('fornecedores')
        .select('*')
        .order('razao_social', {
            ascending: true
        })

    if (error) {
        return { data: null, error }
    }

    return anexarProdutosIds(data)
}

// =========================
// BUSCAR FORNECEDOR POR ID
// =========================
export const buscarFornecedorPorId = async (id) => {
    const { data, error } = await supabase
        .from('fornecedores')
        .select('*')
        .eq('id', id)
        .single()

    if (error) {
        return { data: null, error }
    }

    const resultado = await anexarProdutosIds([data])

    if (resultado.error) {
        return { data: null, error: resultado.error }
    }

    return {
        data: resultado.data[0],
        error: null
    }
}


// =========================
// CRIAR FORNECEDOR
// =========================

export const inserirFornecedor = async (dados) => {
    const { produtos_ids, ...dadosFornecedor } = dados

    let idsUnicos = null

    // Valida os produtos quando a lista for informada
    if (produtos_ids !== undefined) {
        if (!Array.isArray(produtos_ids) || produtos_ids.length === 0) {
            return {
                error: {
                    message: 'Informe pelo menos um produto para o fornecedor'
                }
            }
        }

        idsUnicos = [...new Set(produtos_ids)]

        if (idsUnicos.some(id =>
            typeof id !== 'string' || !id.trim()
        )) {
            return {
                error: {
                    message: 'Lista de produtos inválida'
                }
            }
        }

        const { data: produtos, error: erroProdutos } = await supabase
            .from('produtos')
            .select('id, ativo')
            .in('id', idsUnicos)

        if (erroProdutos) {
            return { data: null, error: erroProdutos }
        }

        const produtosInvalidos = idsUnicos.filter(id =>
            !produtos?.some(produto => produto.id === id && produto.ativo)
        )

        if (produtosInvalidos.length > 0) {
            return {
                error: {
                    message: 'Um ou mais produtos não existem ou estão inativos'
                }
            }
        }
    }

    // Verifica duplicidade do CNPJ
    if (dadosFornecedor.cnpj) {
        const { data: existe, error: erroBusca } = await supabase
            .from('fornecedores')
            .select('id')
            .eq('cnpj', dadosFornecedor.cnpj)
            .maybeSingle()

        if (erroBusca) {
            return { data: null, error: erroBusca }
        }

        if (existe) {
            return {
                error: {
                    message: 'CNPJ já cadastrado'
                }
            }
        }
    }

    // Cria o fornecedor sem enviar produtos_ids à tabela
    const { data: fornecedores, error: erroFornecedor } = await supabase
        .from('fornecedores')
        .insert([dadosFornecedor])
        .select()

    if (erroFornecedor) {
        return { data: null, error: erroFornecedor }
    }

    const fornecedor = fornecedores?.[0]

    if (!fornecedor) {
        return {
            error: {
                message: 'Não foi possível recuperar o fornecedor criado'
            }
        }
    }

    // Registra os produtos associados, caso tenham sido informados
    if (idsUnicos !== null) {
        const vinculos = idsUnicos.map(produto_id => ({
            fornecedor_id: fornecedor.id,
            produto_id
        }))

        const { error: erroVinculos } = await supabase
            .from('fornecedores_produtos')
            .insert(vinculos)

        if (erroVinculos) {
            const { error: erroCompensacao } = await supabase
                .from('fornecedores')
                .delete()
                .eq('id', fornecedor.id)

            return {
                data: null,
                error: {
                    message: erroCompensacao
                        ? 'Falha ao vincular produtos e ao desfazer o cadastro do fornecedor'
                        : 'Falha ao vincular produtos; o cadastro do fornecedor foi desfeito',
                    details: erroVinculos.message
                }
            }
        }

        fornecedor.produtos_ids = idsUnicos
    }

    return {
        data: [fornecedor],
        error: null
    }
}


// =========================
// ATUALIZAR FORNECEDOR
// =========================

export const atualizarFornecedor = async (id, dados) => {
    if (!dados || Object.keys(dados).length === 0) {
        return {
            error: {
                message: 'Nenhum dado informado para atualização'
            }
        }
    }

    const { produtos_ids, ...dadosFornecedor } = dados
    let idsUnicos = null

    // Valida os produtos somente quando a lista for enviada
    if (produtos_ids !== undefined) {
        if (!Array.isArray(produtos_ids) || produtos_ids.length === 0) {
            return {
                error: {
                    message: 'Informe pelo menos um produto para o fornecedor'
                }
            }
        }

        idsUnicos = [...new Set(produtos_ids)]

        if (idsUnicos.some(idProduto =>
            typeof idProduto !== 'string' || !idProduto.trim()
        )) {
            return {
                error: {
                    message: 'Lista de produtos inválida'
                }
            }
        }

        const { data: produtos, error: erroProdutos } = await supabase
            .from('produtos')
            .select('id, ativo')
            .in('id', idsUnicos)

        if (erroProdutos) {
            return { data: null, error: erroProdutos }
        }

        const produtosInvalidos = idsUnicos.filter(idProduto =>
            !produtos?.some(produto =>
                produto.id === idProduto && produto.ativo
            )
        )

        if (produtosInvalidos.length > 0) {
            return {
                error: {
                    message: 'Um ou mais produtos não existem ou estão inativos'
                }
            }
        }
    }

    // Valida CNPJ caso seja enviado
    if (dadosFornecedor.cnpj) {
        const { data: existe, error: erroCnpj } = await supabase
            .from('fornecedores')
            .select('id')
            .eq('cnpj', dadosFornecedor.cnpj)
            .neq('id', id)
            .maybeSingle()

        if (erroCnpj) {
            return { data: null, error: erroCnpj }
        }

        if (existe) {
            return {
                error: {
                    message: 'CNPJ já cadastrado'
                }
            }
        }
    }

    // Mantém os campos de atualização já suportados pelo service
    const dadosAtualizacao = {}

    if (dadosFornecedor.nome_fantasia !== undefined) {
        dadosAtualizacao.nome_fantasia = dadosFornecedor.nome_fantasia
    }

    if (dadosFornecedor.telefone !== undefined) {
        dadosAtualizacao.telefone = dadosFornecedor.telefone
    }

    if (dadosFornecedor.email !== undefined) {
        dadosAtualizacao.email = dadosFornecedor.email
    }

    dadosAtualizacao.updated_at = new Date()

    const { data: fornecedorAtualizado, error: erroAtualizacao } =
        await supabase
            .from('fornecedores')
            .update(dadosAtualizacao)
            .eq('id', id)
            .select()
            .maybeSingle()

    if (erroAtualizacao) {
        return { data: null, error: erroAtualizacao }
    }

    if (!fornecedorAtualizado) {
        return {
            error: {
                message: 'Fornecedor não encontrado'
            }
        }
    }

    // Se produtos_ids não foi enviado, preserva os vínculos existentes
    if (idsUnicos === null) {
        return {
            data: [fornecedorAtualizado],
            error: null
        }
    }

    // Guarda os vínculos anteriores para tentar restaurá-los em caso de falha
    const { data: vinculosAntigos, error: erroConsultaVinculos } =
        await supabase
            .from('fornecedores_produtos')
            .select('produto_id')
            .eq('fornecedor_id', id)

    if (erroConsultaVinculos) {
        return { data: null, error: erroConsultaVinculos }
    }

    const { error: erroRemocao } = await supabase
        .from('fornecedores_produtos')
        .delete()
        .eq('fornecedor_id', id)

    if (erroRemocao) {
        return { data: null, error: erroRemocao }
    }

    const novosVinculos = idsUnicos.map(produto_id => ({
        fornecedor_id: id,
        produto_id
    }))

    const { error: erroInsercao } = await supabase
        .from('fornecedores_produtos')
        .insert(novosVinculos)

    if (erroInsercao) {
        // Tenta restaurar os vínculos anteriores
        if (vinculosAntigos?.length > 0) {
            const restauracao = vinculosAntigos.map(vinculo => ({
                fornecedor_id: id,
                produto_id: vinculo.produto_id
            }))

            const { error: erroRestauracao } = await supabase
                .from('fornecedores_produtos')
                .insert(restauracao)

            if (erroRestauracao) {
                return {
                    data: null,
                    error: {
                        message: 'Falha ao atualizar os produtos e restaurar os vínculos anteriores',
                        details: erroInsercao.message,
                        erroRestauracao: erroRestauracao.message
                    }
                }
            }
        }

        return {
            data: null,
            error: {
                message: 'Não foi possível atualizar os produtos do fornecedor',
                details: erroInsercao.message
            }
        }
    }

    fornecedorAtualizado.produtos_ids = idsUnicos

    return {
        data: [fornecedorAtualizado],
        error: null
    }
}


// =========================
// ATIVAR / INATIVAR
// =========================
export const alterarStatusFornecedor =
    async (id) => {

    const {
        data: fornecedor,
        error: buscaError
    } =
        await supabase
            .from('fornecedores')
            .select('ativo')
            .eq('id', id)
            .single()

    if (buscaError || !fornecedor) {

        return {
            error: {
                message:
                    'Fornecedor não encontrado'
            }
        }
    }

    const { data, error } =
        await supabase
            .from('fornecedores')
            .update({
                ativo: !fornecedor.ativo,
                updated_at: new Date()
            })
            .eq('id', id)
            .select()
            .single()

    return { data, error }
}

// =========================
// VERIFICAR RELACIONAMENTOS
// =========================

export const verificarRelacionamentosFornecedorService =
    async (id) => {

        const [
            { count: propostas, error: propostasError },
            { count: ordens, error: ordensError }
        ] = await Promise.all([
            supabase
                .from('cotacao_propostas')
                .select('*', { count: 'exact', head: true })
                .eq('fornecedor_id', id),

            supabase
                .from('ordens_fornecimento')
                .select('*', { count: 'exact', head: true })
                .eq('fornecedor_id', id)
        ]);

        if (propostasError) {
            console.error(
                'Erro ao consultar cotacao_propostas:',
                propostasError
            );
            return { error: propostasError };
        }

        if (ordensError) {
            console.error(
                'Erro ao consultar ordens_fornecimento:',
                ordensError
            );
            return { error: ordensError };
        }

        return {
            data: {
                possuiRelacionamentos: propostas > 0 || ordens > 0,
                relacionamentos: {
                    propostas,
                    ordens
                }
            }
        };
    };


// =========================
// EXCLUIR FORNECEDOR
// =========================
export const deletarFornecedor =
    async (id) => {

    const {
        data: fornecedor,
        error: buscaError
    } =
        await buscarFornecedorPorId(id)

    if (buscaError || !fornecedor) {

        return {
            error: {
                message:
                    'Fornecedor não encontrado'
            }
        }
    }

    const { data, error } =
        await supabase
            .from('fornecedores')
            .delete()
            .eq('id', id)
            .select()

    return { data, error }
}