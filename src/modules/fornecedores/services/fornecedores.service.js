import supabase from '../../../config/supabase.js'

// =========================
// LISTAR FORNECEDORES
// =========================
export const listarFornecedores = async (
    ativo = true
) => {

    return await supabase
        .from('fornecedores')
        .select('*')
        .eq('ativo', ativo)
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

    // VALIDA CNPJ DUPLICADO
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

    // VALIDA CNPJ DUPLICADO
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

    const { data, error } =
        await supabase
            .from('fornecedores')
            .update({
                ...dados,
                updated_at: new Date()
            })
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
    } = await supabase
        .from('fornecedores')
        .select('ativo')
        .eq('id', id)
        .single()

    if (buscaError) {
        return {
            error: buscaError
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

    return { data, error }
}

// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
export const verificarRelacionamentosFornecedorService =
    async (id) => {

    const { count, error } =
        await supabase
            .from('cotacoes')
            .select('*', {
                count: 'exact',
                head: true
            })
            .eq(
                'fornecedor_vencedor_id',
                id
            )

    if (error) {
        return { error }
    }

    return {
        data: {
            possuiRelacionamentos:
                count > 0,
            relacionamentos: {
                cotacoes: count
            }
        }
    }
}

// =========================
// EXCLUIR FORNECEDOR
// =========================
export const deletarFornecedor =
    async (id) => {

    const { data, error } =
        await supabase
            .from('fornecedores')
            .delete()
            .eq('id', id)
            .select()

    return { data, error }
}