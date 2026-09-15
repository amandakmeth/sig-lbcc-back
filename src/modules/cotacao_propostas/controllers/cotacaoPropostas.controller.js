import {
    listarPropostas,
    buscarPropostaPorId,
    inserirProposta,
    atualizarProposta,
    deletarProposta
} from "../services/cotacaoPropostas.service.js";


// =========================
// LISTAR ORÇAMENTOS
// =========================
export const getPropostas = async (req, res) => {

    try {

        const { cotacao_id } = req.query;

        const { data, error } =
            await listarPropostas(cotacao_id);

        if (error) {
            return res.status(500).json({
                erro: error.message
            });
        }

        return res.json(data);

    } catch (err) {

        return res.status(500).json({
            erro: "Erro ao listar orçamentos"
        });
    }
};


// =========================
// BUSCAR ORÇAMENTO POR ID
// =========================
export const getPropostaById = async (req, res) => {

    try {

        const { id } = req.params;

        const { data, error } =
            await buscarPropostaPorId(id);

        if (error || !data) {
            return res.status(404).json({
                erro: "Orçamento não encontrado"
            });
        }

        return res.json(data);

    } catch (err) {

        return res.status(500).json({
            erro: "Erro ao buscar orçamento"
        });
    }
};


// =========================
// CRIAR ORÇAMENTO
// =========================
export const createProposta = async (req, res) => {

    try {

        const {
            cotacao_id,
            fornecedor_id,
            data_proposta,
            validade_proposta,
            prazo_entrega,
            condicoes_pagamento,
            observacoes,
            itens
        } = req.body;

        if (req.user.perfil !== "gestor") {
            return res.status(403).json({
                erro: "Apenas gestor pode registrar orçamentos"
            });
        }

        if (!cotacao_id || !fornecedor_id || !data_proposta) {

            return res.status(400).json({
                erro: "Cotação, fornecedor e data da proposta são obrigatórios"
            });
        }

        const { data, error } =
            await inserirProposta({
                cotacao_id,
                fornecedor_id,
                data_proposta,
                validade_proposta,
                prazo_entrega,
                condicoes_pagamento,
                observacoes,
                itens,
                created_by: req.user.id
            });

        if (error) {

            return res.status(400).json({
                erro: error.message || error
            });
        }

        return res.status(201).json(data);

    } catch (err) {

        return res.status(500).json({
            erro: err.message || "Erro ao criar orçamento"
        });
    }
};


// =========================
// ATUALIZAR ORÇAMENTO
// =========================
export const updateProposta = async (req, res) => {

    try {

        const { id } = req.params;

        const { data, error } =
            await atualizarProposta(id, req.body);

        if (error) {

            return res.status(400).json({
                erro: error.message
            });
        }

        return res.json(data);

    } catch (err) {

        return res.status(500).json({
            erro: "Erro ao atualizar orçamento"
        });
    }
};


// =========================
// DELETAR ORÇAMENTO
// =========================
export const deleteProposta = async (req, res) => {

    try {

        const { id } = req.params;

        const { data, error } =
            await deletarProposta(id);

        if (error) {

            return res.status(400).json({
                erro: error.message
            });
        }

        return res.json({
            message: "Orçamento excluído com sucesso",
            data
        });

    } catch (err) {

        return res.status(500).json({
            erro: "Erro ao excluir orçamento"
        });
    }
};