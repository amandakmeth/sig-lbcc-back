import supabase from "../../../config/supabase.js";

// =========================
// LISTAR PROPOSTAS / ORÇAMENTOS
// =========================
export const listarPropostas = async (cotacaoId = null) => {
    let query = supabase
        .from("cotacao_propostas")
        .select(`
            *,
            cotacao_proposta_itens (
                id,
                proposta_id,
                item_id,
                valor_unitario,
                valor_total,
                observacoes
            )
        `)
        .order("created_at", {
            ascending: false
        });

    if (cotacaoId) {
        query = query.eq("cotacao_id", cotacaoId);
    }

    const { data, error } = await query;

    return {
        data,
        error
    };
};

// =========================
// BUSCAR PROPOSTA POR ID
// =========================
export const buscarPropostaPorId = async (id) => {

    const { data, error } = await supabase
        .from("cotacao_propostas")
        .select(`
            *,
            cotacao_proposta_itens (
                id,
                proposta_id,
                item_id,
                valor_unitario,
                valor_total,
                observacoes
            )
        `)
        .eq("id", id)
        .single();

    return {
        data,
        error
    };
};

// =========================
// CRIAR PROPOSTA / ORÇAMENTO
// =========================
export const inserirProposta = async (dados) => {

    const {
        cotacao_id,
        fornecedor_id,
        data_proposta,
        validade_proposta,
        prazo_entrega,
        condicoes_pagamento,
        observacoes,
        itens = [],
        created_by
    } = dados;

    // =========================
    // VALIDAÇÕES
    // =========================

    if (!cotacao_id) {
        return {
            error: {
                message: "Cotação é obrigatória"
            }
        };
    }

    if (!fornecedor_id) {
        return {
            error: {
                message: "Fornecedor é obrigatório"
            }
        };
    }

    if (!data_proposta) {
        return {
            error: {
                message: "Data da proposta é obrigatória"
            }
        };
    }

    if (!Array.isArray(itens) || itens.length === 0) {
        return {
            error: {
                message: "A proposta deve possuir pelo menos um item"
            }
        };
    }

    // =========================
    // VERIFICAR COTAÇÃO
    // =========================

    const { data: cotacao, error: cotacaoError } =
        await supabase
            .from("cotacoes")
            .select("id, ativo")
            .eq("id", cotacao_id)
            .single();

    if (cotacaoError || !cotacao) {
        return {
            error: {
                message: "Cotação não encontrada"
            }
        };
    }

    if (!cotacao.ativo) {
        return {
            error: {
                message: "Não é possível registrar orçamento para uma cotação inativa"
            }
        };
    }

    // =========================
    // VERIFICAR ITENS DA COTAÇÃO
    // =========================

    const itemIds = itens.map(item => item.item_id);

    const { data: itensCotacao, error: itensError } =
        await supabase
            .from("cotacao_itens")
            .select("id, cotacao_id, quantidade")
            .in("id", itemIds);

    if (itensError) {
        return {
            error: itensError
        };
    }

    if (!itensCotacao || itensCotacao.length !== itemIds.length) {
        return {
            error: {
                message: "Um ou mais itens informados não existem na cotação"
            }
        };
    }

    const itemDeOutraCotacao = itensCotacao.some(
        item => item.cotacao_id !== cotacao_id
    );

    if (itemDeOutraCotacao) {
        return {
            error: {
                message: "Um ou mais itens não pertencem à cotação informada"
            }
        };
    }

    // =========================
    // CALCULAR VALORES
    // =========================

    const itensProcessados = itens.map(item => {

        const itemCotacao = itensCotacao.find(
            itemCotacao => itemCotacao.id === item.item_id
        );

        const valorUnitario = Number(item.valor_unitario);

        if (isNaN(valorUnitario) || valorUnitario < 0) {
            throw new Error(
                "Valor unitário deve ser um número maior ou igual a zero"
            );
        }

        const quantidade = Number(itemCotacao.quantidade);

        const valorTotal = quantidade * valorUnitario;

        return {
            item_id: item.item_id,
            valor_unitario: valorUnitario,
            valor_total: valorTotal,
            observacoes: item.observacoes || null
        };
    });

    const valorTotalProposta = itensProcessados.reduce(
        (total, item) => total + item.valor_total,
        0
    );

    // =========================
    // CRIAR PROPOSTA
    // =========================

    const { data: proposta, error: propostaError } =
        await supabase
            .from("cotacao_propostas")
            .insert([{
                cotacao_id,
                fornecedor_id,
                data_proposta,
                validade_proposta: validade_proposta || null,
                valor_total: valorTotalProposta,
                prazo_entrega: prazo_entrega || null,
                condicoes_pagamento: condicoes_pagamento || null,
                observacoes: observacoes || null,
                selecionada: false,
                created_by: created_by || null
            }])
            .select()
            .single();

    if (propostaError) {
        return {
            error: propostaError
        };
    }

    // =========================
    // CRIAR ITENS DA PROPOSTA
    // =========================

    const itensParaInserir = itensProcessados.map(item => ({
        proposta_id: proposta.id,
        item_id: item.item_id,
        valor_unitario: item.valor_unitario,
        valor_total: item.valor_total,
        observacoes: item.observacoes
    }));

    const { data: itensInseridos, error: itensPropostaError } =
        await supabase
            .from("cotacao_proposta_itens")
            .insert(itensParaInserir)
            .select();

    if (itensPropostaError) {
        // Tenta remover a proposta caso os itens não sejam inseridos
        await supabase
            .from("cotacao_propostas")
            .delete()
            .eq("id", proposta.id);

        return {
            error: itensPropostaError
        };
    }

    return {
        data: {
            ...proposta,
            cotacao_proposta_itens: itensInseridos
        },
        error: null
    };
};

// =========================
// ATUALIZAR PROPOSTA
// =========================
export const atualizarProposta = async (id, dados) => {

    const dadosAtualizacao = {};

    if (dados.fornecedor_id !== undefined) {
        dadosAtualizacao.fornecedor_id = dados.fornecedor_id;
    }

    if (dados.data_proposta !== undefined) {
        dadosAtualizacao.data_proposta = dados.data_proposta;
    }

    if (dados.validade_proposta !== undefined) {
        dadosAtualizacao.validade_proposta = dados.validade_proposta;
    }

    if (dados.prazo_entrega !== undefined) {
        dadosAtualizacao.prazo_entrega = dados.prazo_entrega;
    }

    if (dados.condicoes_pagamento !== undefined) {
        dadosAtualizacao.condicoes_pagamento =
            dados.condicoes_pagamento;
    }

    if (dados.observacoes !== undefined) {
        dadosAtualizacao.observacoes = dados.observacoes;
    }

    dadosAtualizacao.updated_at = new Date();

    const { data, error } =
        await supabase
            .from("cotacao_propostas")
            .update(dadosAtualizacao)
            .eq("id", id)
            .select()
            .single();

    return {
        data,
        error
    };
};

// =========================
// DELETAR PROPOSTA
// =========================
export const deletarProposta = async (id) => {

    const { data: proposta, error: buscaError } =
        await supabase
            .from("cotacao_propostas")
            .select("id")
            .eq("id", id)
            .single();

    if (buscaError || !proposta) {
        return {
            error: {
                message: "Orçamento não encontrado"
            }
        };
    }

    const { error: itensError } =
        await supabase
            .from("cotacao_proposta_itens")
            .delete()
            .eq("proposta_id", id);

    if (itensError) {
        return {
            error: itensError
        };
    }

    const { data, error } =
        await supabase
            .from("cotacao_propostas")
            .delete()
            .eq("id", id)
            .select();

    return {
        data,
        error
    };
};