import {
    inserirOrcamentosNoItem,
    atualizarValorOrcamento,
    removerOrcamento,
    escolherVencedorItem
} from '../services/cotacaoOrcamentos.service.js';

export const createOrcamentosItem = async (req, res) => {

    try {

        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({
                erro: 'Apenas gestor pode registrar orçamentos'
            });
        }

        const { id, itemId } = req.params;

        const {
            data,
            error
        } = await inserirOrcamentosNoItem({
            cotacaoId: id,
            itemId,
            blocos: req.body,
            createdBy: req.user.id
        });

        if (error) {
            return res.status(400).json({
                erro: error.message || error
            });
        }

        return res.status(201).json(data);

    } catch (err) {

        console.error(
            'Erro ao registrar orçamentos:',
            err
        );

        return res.status(500).json({
            erro: err.message || 'Erro ao registrar orçamentos'
        });

    }
};

export const updateOrcamentoItem = async (req, res) => {

    try {

        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({
                erro: 'Apenas gestor pode alterar orçamentos'
            });
        }

        const { id, itemId, orcamentoId } = req.params;

        const {
            data,
            error
        } = await atualizarValorOrcamento({
            cotacaoId: id,
            itemId,
            orcamentoId,
            dados: req.body
        });

        if (error) {
            return res.status(400).json({
                erro: error.message || error
            });
        }

        return res.status(200).json(data);

    } catch (err) {

        console.error(
            'Erro ao alterar orçamento:',
            err
        );

        return res.status(500).json({
            erro: err.message || 'Erro ao alterar orçamento'
        });

    }
};

export const deleteOrcamentoItem = async (req, res) => {

    try {

        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({
                erro: 'Apenas gestor pode apagar orçamentos'
            });
        }

        const { id, itemId, orcamentoId } = req.params;

        const {
            data,
            error
        } = await removerOrcamento({
            cotacaoId: id,
            itemId,
            orcamentoId
        });

        if (error) {
            return res.status(400).json({
                erro: error.message || error
            });
        }

        return res.status(200).json(data);

    } catch (err) {

        console.error(
            'Erro ao apagar orçamento:',
            err
        );

        return res.status(500).json({
            erro: err.message || 'Erro ao apagar orçamento'
        });

    }
};

export const escolherVencedorOrcamentoItem = async (req, res) => {

    try {

        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({
                erro: 'Apenas gestor pode definir o vencedor'
            });
        }

        const { id, itemId } = req.params;

        const {
            data,
            error
        } = await escolherVencedorItem({
            cotacaoId: id,
            itemId,
            orcamentoId: req.body?.orcamento_id
        });

        if (error) {
            return res.status(400).json({
                erro: error.message || error
            });
        }

        return res.status(200).json(data);

    } catch (err) {

        console.error(
            'Erro ao definir vencedor:',
            err
        );

        return res.status(500).json({
            erro: err.message || 'Erro ao definir vencedor'
        });

    }
};
