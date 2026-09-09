import {
    listarItensCotacao,
    buscarItemPorId,
    inserirItemCotacao,
    atualizarItemCotacao,
    deletarItemCotacao
} from '../services/cotacaoItens.service.js';

const CAMPOS_ITEM = [
    'produto_id',
    'descricao',
    'quantidade',
    'unidade',
    'ordem',
    'especificacoes'
];

function extrairDadosItem(body) {

    const dados = {};

    for (const campo of CAMPOS_ITEM) {

        if (body?.[campo] !== undefined) {
            dados[campo] = body[campo];
        }

    }

    return dados;
}

// =========================
// LISTAR ITENS DA COTAÇÃO
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

        const dados =
            extrairDadosItem(req.body);

        const {
            descricao,
            quantidade,
            unidade
        } = dados;

        if (!descricao || !descricao.trim()) {

            return res.status(400).json({
                erro: 'Descrição é obrigatória'
            });

        }

        if (
            quantidade === undefined ||
            quantidade === null ||
            Number(quantidade) <= 0
        ) {

            return res.status(400).json({
                erro: 'Quantidade deve ser maior que zero'
            });

        }

        if (!unidade || !unidade.trim()) {

            return res.status(400).json({
                erro: 'Unidade é obrigatória'
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

        const dados =
            extrairDadosItem(req.body);

        if (
            dados.descricao !== undefined &&
            !dados.descricao.trim()
        ) {

            return res.status(400).json({
                erro: 'Descrição não pode ser vazia'
            });

        }

        if (
            dados.quantidade !== undefined &&
            (
                dados.quantidade === null ||
                Number(dados.quantidade) <= 0
            )
        ) {

            return res.status(400).json({
                erro: 'Quantidade deve ser maior que zero'
            });

        }

        if (
            dados.unidade !== undefined &&
            !dados.unidade.trim()
        ) {

            return res.status(400).json({
                erro: 'Unidade não pode ser vazia'
            });

        }

        if (Object.keys(dados).length === 0) {

            return res.status(400).json({
                erro: 'Nenhum dado informado para atualização'
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