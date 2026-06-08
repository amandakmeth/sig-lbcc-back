import {
    listarItensCotacao,
    buscarItemPorId,
    inserirItemCotacao,
    atualizarItemCotacao,
    deletarItemCotacao
} from '../services/cotacaoItens.service.js';
import { buscarFornecedorPorId } from '../../fornecedores/services/fornecedores.service.js';

const CAMPOS_ITEM = [
    'produto_id',
    'descricao',
    'quantidade',
    'unidade',
    'ordem',
    'especificacoes',
    'fornecedor_id'
];

function extrairDadosItem(body) {
    const dados = {};

    for (const campo of CAMPOS_ITEM) {
        if (body[campo] !== undefined) {
            dados[campo] = body[campo];
        }
    }

    return dados;
}

async function validarFornecedor(fornecedorId) {
    if (!fornecedorId) {
        return 'fornecedor_id é obrigatório';
    }

    const { data: fornecedor, error } =
        await buscarFornecedorPorId(fornecedorId);

    if (error || !fornecedor) {
        return 'Fornecedor não encontrado';
    }

    if (!fornecedor.ativo) {
        return 'Fornecedor inativo';
    }

    return null;
}

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
        const dados = extrairDadosItem(req.body);

        const {
            descricao,
            quantidade,
            unidade,
            fornecedor_id
        } = dados;

        if (
            !descricao ||
            !quantidade ||
            !unidade
        ) {

            return res.status(400).json({
                erro: 'Descrição, quantidade e unidade são obrigatórias'
            });
        }

        const erroFornecedor =
            await validarFornecedor(fornecedor_id);

        if (erroFornecedor) {
            return res.status(400).json({
                erro: erroFornecedor
            });
        }

        const { data, error } =
            await inserirItemCotacao({
                ...dados,
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
        const dados = extrairDadosItem(req.body);

        const erroFornecedor =
            await validarFornecedor(dados.fornecedor_id);

        if (erroFornecedor) {
            return res.status(400).json({
                erro: erroFornecedor
            });
        }

        const { data, error } =
            await atualizarItemCotacao(
                id,
                dados
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
