import {
    gerarOrdensDeFornecimento,
    listarOrdensDeFornecimento,
    buscarOrdemDeFornecimento,
    confirmarRecebimentoOrdemDeFornecimento,
    listarGestoresResponsaveis,
    atualizarPrazoOrdem,
    atualizarStatusPrazoOrdem,
    finalizarOrdemDeFornecimento
} from '../services/fornecimento.services.js';
import {
    buscarLembreteFornecedor,
    enviarLembreteFornecedor,
    LEMBRETE_STATUS,
    MAX_TENTATIVAS_LEMBRETE
} from '../../notificacoes/services/lembretes-fornecedor.service.js';
import {
    agendarEnvioInicial,
    obterPdfOrdemDeFornecimento,
    processarEnvioOrdemDeFornecimento,
    solicitarReenvioOrdemDeFornecimento
} from '../services/ordem-fornecimento-email.service.js';

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

        for (const ordem of data || []) {
            const agendamento = await agendarEnvioInicial({ ordemId: ordem.id });
            if (agendamento.error) {
                console.error('Erro ao agendar envio da Ordem de Fornecimento:', agendamento.error);
                continue;
            }

            void processarEnvioOrdemDeFornecimento({ ordemId: ordem.id }).catch((envioError) => {
                console.error('Erro ao iniciar envio da Ordem de Fornecimento:', envioError);
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
        if (!['gestor', 'operador'].includes(req.user?.perfil)) {
            return res.status(403).json({ message: 'Apenas operador ou gestor pode confirmar o recebimento' });
        }

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

export async function reenviarEmailOrdem(req, res) {
    if (req.user?.perfil !== 'gestor') {
        return res.status(403).json({ message: 'Apenas gestor pode reenviar o email da ordem' });
    }

    const resultado = await solicitarReenvioOrdemDeFornecimento({
        ordemId: req.params.id,
        usuarioId: req.user.id
    });

    if (resultado.error) {
        const status = resultado.error.code === 'ORDEM_NAO_ENCONTRADA' ? 404 : 409;
        return res.status(status).json({ message: resultado.error.message });
    }

    void processarEnvioOrdemDeFornecimento({ ordemId: req.params.id }).catch((error) => {
        console.error('Erro ao iniciar reenvio da Ordem de Fornecimento:', error);
    });

    return res.status(202).json({
        message: 'Reenvio da Ordem de Fornecimento solicitado com sucesso',
        data: resultado.data
    });
}

export async function baixarPdfOrdem(req, res) {
    const resultado = await obterPdfOrdemDeFornecimento({ ordemId: req.params.id });

    if (resultado.error) {
        const status = resultado.error.message?.toLowerCase().includes('nao encontrada') ? 404 : 500;
        return res.status(status).json({ message: resultado.error.message });
    }

    const { buffer, filename, origem, versao } = resultado.data;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Ordem-PDF-Origem', origem);
    if (versao) res.setHeader('X-Ordem-PDF-Versao', String(versao));
    return res.send(buffer);
}

export async function finalizarOrdem(req, res) {
    if (req.user?.perfil !== 'gestor') {
        return res.status(403).json({ message: 'Apenas gestor pode finalizar a ordem de fornecimento' });
    }

    const resultado = await finalizarOrdemDeFornecimento({
        id: req.params.id,
        atualizadoPor: req.user.id
    });

    if (resultado.error) {
        const status = resultado.error.message?.includes('nao encontrada') ? 404 : 400;
        return res.status(status).json({ message: resultado.error.message });
    }

    return res.json(resultado.data);
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

export async function obterLembreteFornecedor(req, res) {
    const resultado = await buscarLembreteFornecedor({
        ordemId: req.params.id
    });

    if (resultado.error) return res.status(500).json({ message: resultado.error.message });
    if (!resultado.data) return res.status(404).json({ message: 'Lembrete do fornecedor nao agendado' });

    return res.json(resultado.data);
}

export async function reenviarLembreteFornecedor(req, res) {
    if (req.user?.perfil !== 'gestor') {
        return res.status(403).json({ message: 'Apenas gestor pode reenviar lembretes ao fornecedor' });
    }

    const atual = await buscarLembreteFornecedor({ ordemId: req.params.id });
    if (atual.error) return res.status(500).json({ message: atual.error.message });
    if (!atual.data) return res.status(404).json({ message: 'Lembrete do fornecedor nao agendado' });

    const podeReenviar = [
        LEMBRETE_STATUS.FALHA_RECUPERAVEL,
        LEMBRETE_STATUS.FALHA_DEFINITIVA
    ].includes(atual.data.status);

    if (!podeReenviar) {
        return res.status(409).json({ message: 'O lembrete so pode ser reenviado quando houver falha' });
    }

    if (Number(atual.data.tentativas_realizadas || 0) >= MAX_TENTATIVAS_LEMBRETE) {
        return res.status(409).json({ message: 'O lembrete atingiu o limite de tentativas' });
    }

    const resultado = await enviarLembreteFornecedor({
        ordemId: req.params.id,
        ciclo: atual.data.prazo_ciclo,
        manual: true,
        usuarioId: req.user.id
    });

    if (resultado.error) {
        const status = resultado.error.code === 'LEMBRETE_NAO_AGENDADO' ? 404 : 500;
        return res.status(status).json({ message: resultado.error.message });
    }

    const atualizado = await buscarLembreteFornecedor({
        ordemId: req.params.id,
        ciclo: atual.data.prazo_ciclo
    });
    if (atualizado.error) return res.status(500).json({ message: atualizado.error.message });

    return res.json(atualizado.data);
}
