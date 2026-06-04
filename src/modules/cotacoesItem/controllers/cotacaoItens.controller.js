import {
    listarItensCotacao,
    buscarItemPorId,
    inserirItemCotacao,
    atualizarItemCotacao,
    deletarItemCotacao
} from '../services/cotacaoItens.service.js';

// =========================
// listar
// =========================
export const getItensCotacao = async (
    req,
    res
) => {

    try {

        const { cotacaoId } = req.params;

        const { data, error } =
            await listarItensCotacao(cotacaoId);

        if (error) {
            return res.status(500).json({
                erro: error.message
            });
        }

        return res.json(data);

    } catch {

        return res.status(500).json({
            erro: 'Erro ao listar itens'
        });
    }
};

// =========================
// BUSCAR ITEM
// =========================
export const getItemById = async (
    req,
    res
) => {

    try {

        const { id } = req.params;

        const { data, error } =
            await buscarItemPorId(id);

        if (error || !data) {
            return res.status(404).json({
                erro: 'Item não encontrado'
            });
        }

        return res.json(data);

    } catch {

        return res.status(500).json({
            erro: 'Erro ao buscar item'
        });
    }
};

// =========================
// CRIAR ITEM
// =========================
export const createItemCotacao = async (
    req,
    res
) => {

    try {

        const { cotacaoId } = req.params;

        const {
            descricao,
            quantidade,
            unidade
        } = req.body;

        if (
            !descricao ||
            !quantidade ||
            !unidade
        ) {

            return res.status(400).json({
                erro: 'Descrição, quantidade e unidade são obrigatórias'
            });
        }

        const { data, error } =
            await inserirItemCotacao({
                ...req.body,
                cotacao_id: cotacaoId
            });

        if (error) {
            return res.status(400).json({
                erro: error.message
            });
        }

        return res.status(201).json(data);

    } catch {

        return res.status(500).json({
            erro: 'Erro ao criar item'
        });
    }
};

// =========================
// ATUALIZAR ITEM
// =========================
export const updateItemCotacao = async (
    req,
    res
) => {

    try {

        const { id } = req.params;

        const { data, error } =
            await atualizarItemCotacao(
                id,
                req.body
            );

        if (error) {
            return res.status(400).json({
                erro: error.message
            });
        }

        return res.json(data);

    } catch {

        return res.status(500).json({
            erro: 'Erro ao atualizar item'
        });
    }
};

// =========================
// EXCLUIR ITEM
// =========================
export const deleteItemCotacao = async (
    req,
    res
) => {

    try {

        const { id } = req.params;

        const { error } =
            await deletarItemCotacao(id);

        if (error) {
            return res.status(400).json({
                erro: error.message
            });
        }

        return res.status(200).json({
            message: 'Item removido com sucesso'
        });

    } catch {

        return res.status(500).json({
            erro: 'Erro ao excluir item'
        });
    }
};