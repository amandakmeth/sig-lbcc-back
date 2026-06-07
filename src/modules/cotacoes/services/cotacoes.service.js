import supabase from '../../../config/supabase.js';

// =========================
// LISTAR COTAÇÕES
// =========================
export const listarCotacoes = async (
    ativo = true
) => {

    const { data, error } =
        await supabase
            .from('cotacoes')
            .select(`
                *,
                pacientes:paciente_id (
                    id,
                    nome
                ),
                areas:area_id (
                    id,
                    nome
                )
            `)
            .eq('ativo', ativo)
            .order('created_at', {
                ascending: false
            });

    if (error) {
        return { data, error };
    }

    const hoje = new Date();

    const cotacoes =
        data.map(cotacao => ({

            ...cotacao,

            vencida:
                new Date(
                    cotacao.data_validade
                ) < hoje

        }));

    return {
        data: cotacoes,
        error: null
    };
};
// =========================
// BUSCAR COTAÇÃO POR ID
// =========================
export const buscarCotacaoPorId = async (id) => {

    return await supabase
        .from('cotacoes')
        .select(`
            *,
            pacientes:paciente_id (
                id,
                nome
            ),
            areas:area_id (
                id,
                nome
            )
        `)
        .eq('id', id)
        .single();
};

// =========================
// CRIAR COTAÇÃO
// =========================
export const inserirCotacao = async (dados) => {

   if (
    !dados.descricao ||
    !dados.data_validade ||
    !dados.paciente_id
) {
    return {
        error: {
            message:
                'Descrição, data de validade e paciente são obrigatórios'
        }
    };
}

    if (dados.numero) {

        const { data: existe } =
            await supabase
                .from('cotacoes')
                .select('id')
                .eq('numero', dados.numero)
                .maybeSingle();

        if (existe) {

            return {
                error: {
                    message: 'Número da cotação já existe'
                }
            };
        }
    }

    const { data, error } =
        await supabase
            .from('cotacoes')
            .insert([dados])
            .select()
            .single();

    return { data, error };
};

// =========================
// ATUALIZAR COTAÇÃO
// =========================
export const atualizarCotacao = async (id, dados) => {

    if (!dados || Object.keys(dados).length === 0) {

        return {
            error: {
                message: 'Nenhum dado informado para atualização'
            }
        };
    }

    const dadosAtualizacao = {};

    if (dados.descricao !== undefined) {
        dadosAtualizacao.descricao = dados.descricao;
    }

    if (dados.data_validade !== undefined) {
        dadosAtualizacao.data_validade = dados.data_validade;
    }

    if (dados.observacoes !== undefined) {
        dadosAtualizacao.observacoes = dados.observacoes;
    }

    if (dados.paciente_id !== undefined) {
        dadosAtualizacao.paciente_id = dados.paciente_id;
    }

    if (dados.area_id !== undefined) {
        dadosAtualizacao.area_id = dados.area_id;
    }

    if (dados.status !== undefined) {
        dadosAtualizacao.status = dados.status;
    }

    dadosAtualizacao.updated_at = new Date();

    const { data, error } =
        await supabase
            .from('cotacoes')
            .update(dadosAtualizacao)
            .eq('id', id)
            .select()
            .single();

    return { data, error };
};

// =========================
// ATIVAR / INATIVAR (SOFT DELETE)
// =========================
export const alterarStatusCotacao = async (id) => {

    const { data: cotacao, error: buscaError } =
        await supabase
            .from('cotacoes')
            .select('ativo')
            .eq('id', id)
            .single();

    if (buscaError || !cotacao) {
        return {
            error: {
                message: 'Cotação não encontrada'
            }
        };
    }

    const { data, error } =
        await supabase
            .from('cotacoes')
            .update({
                ativo: !cotacao.ativo,
                updated_at: new Date()
            })
            .eq('id', id)
            .select()
            .single();

    return { data, error };
};
// =========================
// ALTERAR VALIDADE DA COTAÇÃO
// =========================
export const alterarValidadeCotacao = async (
    id,
    status,
    usuarioId
) => {

    const statusPermitidos = [
        'valida',
        'expirada'
    ];

    if (!statusPermitidos.includes(status)) {
        return {
            error: {
                message: 'Status inválido'
            }
        };
    }

    const { data, error } =
        await supabase
            .from('cotacoes')
            .update({
                status,
                updated_by: usuarioId,
                updated_at: new Date()
            })
            .eq('id', id)
            .select()
            .single();

    return { data, error };
};
// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
export const verificarRelacionamentosCotacaoService = async (id) => {

    const { count: propostas, error: error1 } =
        await supabase
            .from('cotacao_propostas')
            .select('*', { count: 'exact', head: true })
            .eq('cotacao_id', id);

    const { count: itens, error: error2 } =
        await supabase
            .from('cotacao_itens')
            .select('*', { count: 'exact', head: true })
            .eq('cotacao_id', id);

    if (error1 || error2) {
        return { error: error1 || error2 };
    }

    return {
        data: {
            possuiRelacionamentos:
                (propostas > 0 || itens > 0),

            relacionamentos: {
                propostas,
                itens
            }
        }
    };
};

// =========================
// EXCLUIR COTAÇÃO
// =========================
export const deletarCotacao = async (id) => {

    const { data: cotacao, error: buscaError } =
        await buscarCotacaoPorId(id);

    if (buscaError || !cotacao) {
        return {
            error: {
                message: 'Cotação não encontrada'
            }
        };
    }

    const { data, error } =
        await supabase
            .from('cotacoes')
            .delete()
            .eq('id', id)
            .select();

    return { data, error };
};