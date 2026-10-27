import {
    buildVoucherTransportePdf,
    nomeArquivoVoucherTransporte
} from '../services/voucher-transporte-pdf.service.js';


import {
    emitirOrdemDeTransporte,
    listarOrdensDeTransporte,
    buscarOrdemDeTransporte,
    atualizarOrdemDeTransporte,
    listarVouchersTransporte,
    buscarVoucherTransporte,
    registrarEntregaVoucherTransporte,
    gerarSegundaViaVoucherTransporte
} from '../services/ordensTransporte.service.js';
export async function postOrdemTransporte(req, res) {
    console.log('[RF_F11] Controller postOrdemTransporte executado');
    console.log('[RF_F11] Método:', req.method);
    console.log('[RF_F11] URL:', req.originalUrl);
    try {
        const {
            cotacao_id,
            veiculo_placa,
            tipo_combustivel,
            quantidade_autorizada,
            posto_abastecimento,
            validade_ate,
            observacoes
        } = req.body;

        const { data, error } = await emitirOrdemDeTransporte({
            cotacaoId: cotacao_id,
            veiculoPlaca: veiculo_placa,
            tipoCombustivel: tipo_combustivel,
            quantidadeAutorizada: quantidade_autorizada,
            postoAbastecimento: posto_abastecimento,
            validadeAte: validade_ate,
            observacoes,
            emitidoPor: req.user?.id
        });

        if (error) {
            const statusPorCodigo = {
                COTACAO_NAO_ENCONTRADA: 404,
                OT_JA_EXISTE: 409,
                COTACAO_NAO_FINALIZADA: 400,
                COTACAO_INATIVA: 400,
                COTACAO_VENCIDA: 400,
                COTACAO_NAO_E_TRANSPORTE: 400,
                COTACAO_SEM_ITENS: 400,
                VENCEDOR_ITEM_INVALIDO: 400,
                FORNECEDORES_VENCEDORES_DIVERGENTES: 400,
                FORNECEDOR_VENCEDOR_DIVERGENTE: 400,
                FORNECEDOR_INATIVO: 400,
                PACIENTE_OBRIGATORIO: 400
            };

            const status = statusPorCodigo[error.code] || 400;

            return res.status(status).json({
                erro: error.message || 'Não foi possível emitir a OT.',
                codigo: error.code
            });
        }

        return res.status(201).json(data);
    } catch (err) {
        console.error('Erro ao emitir Ordem de Transporte:', err);
        return res.status(500).json({
            erro: 'Erro interno ao emitir Ordem de Transporte.'
        });
    }
}

export async function getVoucherTransportePdf(req, res) {
    try {
        const { id, voucherId } = req.params;

        const { data, error } = await buscarVoucherTransporte(id, voucherId);

        if (error) {
            const status = [
                'OT_NAO_ENCONTRADA',
                'VOUCHER_NAO_ENCONTRADO'
            ].includes(error.code) ? 404 : 500;

            return res.status(status).json({
                erro: error.message || 'Não foi possível consultar o voucher.'
            });
        }

        const pdf = buildVoucherTransportePdf(data, data.voucher);
        const arquivo = nomeArquivoVoucherTransporte(data, data.voucher);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${arquivo}"`
        );

        return res.status(200).send(pdf);
    } catch (err) {
        console.error('Erro ao gerar PDF do voucher:', err);
        return res.status(500).json({
            erro: 'Erro interno ao gerar o PDF do voucher.'
        });
    }
}
export async function postEntregaVoucherTransporte(req, res) {
    try {
        const { id, voucherId } = req.params;
        const { destinatario } = req.body;

        const { data, error } = await registrarEntregaVoucherTransporte({
            ordemId: id,
            voucherId,
            entreguePor: req.user?.id,
            destinatario
        });

        if (error) {
            const statusPorCodigo = {
                OT_NAO_ENCONTRADA: 404,
                VOUCHER_NAO_ENCONTRADO: 404,
                DESTINATARIO_OBRIGATORIO: 400,
                USUARIO_OBRIGATORIO: 401,
                OT_NAO_PODE_SER_ENTREGUE: 409,
                OT_VENCIDA: 409,
                VOUCHER_JA_ENTREGUE: 409
            };

            return res.status(statusPorCodigo[error.code] || 500).json({
                erro: error.message,
                codigo: error.code
            });
        }

        return res.status(200).json(data);
    } catch (err) {
        console.error('Erro ao registrar entrega do voucher:', err);

        return res.status(500).json({
            erro: 'Erro interno ao registrar a entrega do voucher.'
        });
    }
}

export async function postSegundaViaVoucherTransporte(req, res) {
    try {
        const { id } = req.params;

        const { data, error } = await gerarSegundaViaVoucherTransporte({
            ordemId: id,
            emitidoPor: req.user?.id
        });

        if (error) {
            const statusPorCodigo = {
                DADOS_OBRIGATORIOS: 400,
                OT_NAO_ENCONTRADA: 404,
                USUARIO_NAO_ENCONTRADO: 401,
                OT_NAO_PERMITE_SEGUNDA_VIA: 409,
                OT_VENCIDA: 409
            };

            return res.status(statusPorCodigo[error.code] || 500).json({
                erro: error.message,
                codigo: error.code
            });
        }

        return res.status(201).json(data);
    } catch (err) {
        console.error('Erro ao emitir segunda via do voucher:', err);

        return res.status(500).json({
            erro: 'Erro interno ao emitir a segunda via do voucher.'
        });
    }
}

export async function getOrdensTransporte(req, res) {
    try {
        const { data, error } = await listarOrdensDeTransporte();

        if (error) {
            console.error('Erro ao listar OTs:', error);
            return res.status(500).json({
                erro: 'Não foi possível listar as Ordens de Transporte.'
            });
        }

        return res.status(200).json(data);
    } catch (err) {
        console.error('Erro ao listar OTs:', err);
        return res.status(500).json({
            erro: 'Erro interno ao listar as Ordens de Transporte.'
        });
    }
}

export async function getOrdemTransporte(req, res) {
    try {
        const { id } = req.params;
        const { data, error } = await buscarOrdemDeTransporte(id);

        if (error) {
            const status = error.code === 'OT_NAO_ENCONTRADA' ? 404 : 500;

            return res.status(status).json({
                erro: error.message || 'Não foi possível consultar a OT.',
                codigo: error.code
            });
        }

        return res.status(200).json(data);
    } catch (err) {
        console.error('Erro ao consultar OT:', err);
        return res.status(500).json({
            erro: 'Erro interno ao consultar a Ordem de Transporte.'
        });
    }
}

export async function patchOrdemTransporte(req, res) {
    if (req.user?.perfil !== 'gestor') {
        return res.status(403).json({
            erro: 'Somente gestores podem editar Ordens de Transporte.'
        });
    }

    try {
        const { id } = req.params;

        const {
            veiculo_placa,
            tipo_combustivel,
            quantidade_autorizada,
            posto_abastecimento,
            validade_ate,
            observacoes
        } = req.body;

        const { data, error } = await atualizarOrdemDeTransporte({
            id,
            veiculoPlaca: veiculo_placa,
            tipoCombustivel: tipo_combustivel,
            quantidadeAutorizada: quantidade_autorizada,
            postoAbastecimento: posto_abastecimento,
            validadeAte: validade_ate,
            observacoes
        });

        if (error) {
            const statusPorCodigo = {
                OT_NAO_ENCONTRADA: 404,
                OT_NAO_PENDENTE: 409
            };

            return res.status(statusPorCodigo[error.code] || 400).json({
                erro: error.message || 'Não foi possível atualizar a OT.',
                codigo: error.code
            });
        }

        return res.status(200).json(data);
    } catch (err) {
        console.error('Erro ao atualizar OT:', err);
        return res.status(500).json({
            erro: 'Erro interno ao atualizar a Ordem de Transporte.'
        });
    }
}

export async function getVouchersTransporte(req, res) {
    try {
        const { id } = req.params;

        const { data, error } = await listarVouchersTransporte(id);

        if (error) {
            const status = error.code === 'OT_NAO_ENCONTRADA'
                ? 404
                : error.code === 'DADOS_OBRIGATORIOS'
                    ? 400
                    : 500;

            return res.status(status).json({
                erro: error.message || 'Não foi possível listar os vouchers.',
                codigo: error.code
            });
        }

        return res.status(200).json(data);
    } catch (err) {
        console.error('Erro ao listar vouchers da OT:', err);

        return res.status(500).json({
            erro: 'Erro interno ao listar os vouchers.'
        });
    }
}
