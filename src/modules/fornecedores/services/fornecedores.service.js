import supabase from '../../../config/supabase.js'

// =========================
// LISTAR FORNECEDORES
// =========================
export const listarFornecedores = async () => {
    return await supabase
        .from('fornecedores')
        .select('*')
        .order('razao_social', {
            ascending: true
        })
}

// =========================
// BUSCAR FORNECEDOR POR ID
// =========================
export const buscarFornecedorPorId =
    async (id) => {

    return await supabase
        .from('fornecedores')
        .select('*')
        .eq('id', id)
        .single()
}

// =========================
// CRIAR FORNECEDOR
// =========================
export const inserirFornecedor =
    async (dados) => {

    if (dados.cnpj) {

        const { data: existe } =
            await supabase
                .from('fornecedores')
                .select('id')
                .eq('cnpj', dados.cnpj)
                .maybeSingle()

        if (existe) {

            return {
                error: {
                    message:
                        'CNPJ já cadastrado'
                }
            }
        }
    }

    const { data, error } =
        await supabase
            .from('fornecedores')
            .insert([dados])
            .select()

    return { data, error }
}

// =========================
// ATUALIZAR FORNECEDOR
// =========================
export const atualizarFornecedor =
    async (id, dados) => {

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

    // valida CNPJ caso seja enviado
    if (dados.cnpj) {

        const { data: existe } =
            await supabase
                .from('fornecedores')
                .select('id')
                .eq('cnpj', dados.cnpj)
                .neq('id', id)
                .maybeSingle()

        if (existe) {

            return {
                error: {
                    message:
                        'CNPJ já cadastrado'
                }
            }
        }
    }

    const dadosAtualizacao = {}

    if (dados.nome_fantasia !== undefined) {
        dadosAtualizacao.nome_fantasia =
            dados.nome_fantasia
    }

    if (dados.telefone !== undefined) {
        dadosAtualizacao.telefone =
            dados.telefone
    }

    if (dados.email !== undefined) {
        dadosAtualizacao.email =
            dados.email
    }

    dadosAtualizacao.updated_at =
        new Date()

    const { data, error } =
        await supabase
            .from('fornecedores')
            .update(dadosAtualizacao)
            .eq('id', id)
            .select()

    return { data, error }
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
        { count: itens, error: itensError }
    ] = await Promise.all([
        supabase
            .from('cotacao_propostas')
            .select('*', {
                count: 'exact',
                head: true
            })
            .eq('fornecedor_id', id),
        supabase
            .from('cotacao_itens')
            .select('*', {
                count: 'exact',
                head: true
            })
            .eq('fornecedor_id', id)
    ])

    if (propostasError) {
        return { error: propostasError }
    }

    if (itensError) {
        return { error: itensError }
    }

    return {
        data: {
            possuiRelacionamentos:
                propostas > 0 || itens > 0,

            relacionamentos: {
                propostas,
                itens
            }
        }
    }
}

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