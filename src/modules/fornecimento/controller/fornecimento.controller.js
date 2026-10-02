import {
    gerarOrdensDeFornecimento,
    listarOrdensDeFornecimento,
    buscarOrdemDeFornecimento,
    confirmarRecebimentoOrdemDeFornecimento,
    listarGestoresResponsaveis,
    atualizarPrazoOrdem,
    atualizarStatusPrazoOrdem
} from '../services/fornecimento.services.js';

import { registrarOcorrencia } from '../../historico_pacientes/services/auditoria.service.js';


// =========================
// GERAR ORDENS
// =========================

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


// =========================
// LISTAR ORDENS
// =========================

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


// =========================
// BUSCAR ORDEM
// =========================

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


// =========================
// CONFIRMAR RECEBIMENTO
// =========================

export async function confirmarRecebimento(req, res) {
    try {
        const { id } = req.params;

        const {
            data,
            error
        } = await confirmarRecebimentoOrdemDeFornecimento({
            id,
            atualizadoPor: req.user?.id || null
        });

        if (error) {
            return res.status(400).json({
                message:
                    error.message ||
                    'Erro ao confirmar recebimento da ordem de fornecimento'
            });
        }


        // =========================
        // REGISTRAR AUDITORIA
        // =========================

        await registrarOcorrencia({
            paciente_id: data.paciente_id,
            usuario_id: req.user?.id || null,
            tipo_evento: 'OF_RECEBIMENTO_CONFIRMADO',
            descricao:
                `Recebimento da Ordem de Fornecimento ${data.numero} confirmado pelo fornecedor`,
            referencia_id: data.id
        });


        // =========================
        // RETORNO
        // =========================

        return res.status(200).json({
            message:
                'Recebimento da ordem de fornecimento confirmado com sucesso',
            data
        });

    } catch (error) {
        console.error(
            'Erro ao confirmar recebimento da ordem de fornecimento:',
            error
        );

        return res.status(500).json({
            message:
                'Erro interno ao confirmar recebimento da ordem de fornecimento'
        });
    }
}

export async function listarGestores(req, res) {
    const { data, error } = await listarGestoresResponsaveis();
    if (error) return res.status(500).json({ message: error.message });
    return res.json(data);
}

export async function atualizarPrazo(req, res) {
    if (req.user?.perfil !== 'gestor') {
        return res.status(403).json({ message: 'Apenas gestor pode alterar prazo e responsaveis' });
    }

    const body = req.body || {};
    const responsavelIds = body.responsavel_ids ?? body.gestor_ids;
    const resultado = await atualizarPrazoOrdem({
        id: req.params.id,
        dataPrevisaoEntrega: body.data_previsao_entrega,
        responsavelIds,
        atualizadoPor: req.user.id
    });

    if (resultado.error) {
        const status = resultado.error.message?.includes('nao encontrada') ? 404 : 400;
        return res.status(status).json({ message: resultado.error.message });
    }

    return res.json(resultado.data);
}

export async function atualizarStatusPrazo(req, res) {
    if (req.user?.perfil !== 'gestor') {
        return res.status(403).json({ message: 'Apenas gestor pode alterar status de prazo' });
    }

    const resultado = await atualizarStatusPrazoOrdem({
        id: req.params.id,
        statusPrazo: req.body?.status_prazo,
        usuarioId: req.user.id
    });

    if (resultado.error) {
        const status = resultado.error.message?.includes('nao encontrada') ? 404 : 400;
        return res.status(status).json({ message: resultado.error.message });
    }

    return res.json(resultado.data);
}
