import {
    gerarOrdensDeFornecimento,
    listarOrdensDeFornecimento,
    buscarOrdemDeFornecimento
} from '../services/fornecimento.services.js';

export async function gerarOrdens(req, res) {
    try {
        const { cotacaoId } = req.params;

        const {
            data,
            error
        } = await gerarOrdensDeFornecimento({
            cotacaoId,
            criadoPor: req.user?.id || null
        });

        if (error) {
            return res.status(400).json({
                message:
                    error.message ||
                    'Erro ao gerar ordens de fornecimento'
            });
        }

        return res.status(201).json(data);
    } catch (error) {
        console.error(
            'Erro ao gerar ordens de fornecimento:',
            error
        );

        return res.status(500).json({
            message:
                'Erro interno ao gerar ordens de fornecimento'
        });
    }
}

export async function listarOrdens(req, res) {
    try {
        const {
            data,
            error
        } = await listarOrdensDeFornecimento();

        if (error) {
            return res.status(400).json({
                message:
                    error.message ||
                    'Erro ao listar ordens de fornecimento'
            });
        }

        return res.status(200).json(data);
    } catch (error) {
        console.error(
            'Erro ao listar ordens de fornecimento:',
            error
        );

        return res.status(500).json({
            message:
                'Erro interno ao listar ordens de fornecimento'
        });
    }
}

export async function buscarOrdem(req, res) {
    try {
        const { id } = req.params;

        const {
            data,
            error
        } = await buscarOrdemDeFornecimento(id);

        if (error) {
            return res.status(404).json({
                message:
                    error.message ||
                    'Ordem de fornecimento não encontrada'
            });
        }

        return res.status(200).json(data);
    } catch (error) {
        console.error(
            'Erro ao buscar ordem de fornecimento:',
            error
        );

        return res.status(500).json({
            message:
                'Erro interno ao buscar ordem de fornecimento'
        });
    }
}