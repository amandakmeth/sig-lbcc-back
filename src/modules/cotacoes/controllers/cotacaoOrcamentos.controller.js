import { inserirOrcamentosNoItem } from '../services/cotacaoOrcamentos.service.js';

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
