
import { jest } from '@jest/globals';

const emitirOrdemDeTransporte = jest.fn();
const listarOrdensDeTransporte = jest.fn();
const buscarOrdemDeTransporte = jest.fn();
const atualizarOrdemDeTransporte = jest.fn();
const buscarVoucherTransporte = jest.fn();
const registrarEntregaVoucherTransporte = jest.fn();
const gerarSegundaViaVoucherTransporte = jest.fn();
const listarVouchersTransporte = jest.fn();

const buildVoucherTransportePdf = jest.fn();
const nomeArquivoVoucherTransporte = jest.fn();

jest.unstable_mockModule(
    '../src/modules/transporte/services/ordensTransporte.service.js',
    () => ({
        emitirOrdemDeTransporte,
        listarOrdensDeTransporte,
        buscarOrdemDeTransporte,
        atualizarOrdemDeTransporte,
        buscarVoucherTransporte,
        registrarEntregaVoucherTransporte,
        gerarSegundaViaVoucherTransporte,
        listarVouchersTransporte
    })
);

jest.unstable_mockModule(
    '../src/modules/transporte/services/voucher-transporte-pdf.service.js',
    () => ({
        buildVoucherTransportePdf,
        nomeArquivoVoucherTransporte
    })
);

const {
    postOrdemTransporte,
    getOrdensTransporte,
    getOrdemTransporte,
    patchOrdemTransporte,
    getVoucherTransportePdf,
    postEntregaVoucherTransporte,
    postSegundaViaVoucherTransporte,
    getVouchersTransporte
} = await import(
    '../src/modules/transporte/controllers/ordensTransporte.controller.js'
);


function criarResponse() {
    const res = {
        status: jest.fn(),
        json: jest.fn(),
        send: jest.fn(),
        setHeader: jest.fn()
    };

    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    res.send.mockReturnValue(res);

    return res;
}

describe('RF_F11 - controller de Ordem de Transporte', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('emite OT e retorna 201', async () => {
        const ordem = {
            id: 'ot-1',
            numero: 'OT-TESTE',
            status: 'emitida'
        };

        emitirOrdemDeTransporte.mockResolvedValue({
            data: ordem,
            error: null
        });

        const req = {
            user: { id: 'usuario-1' },
            body: {
                cotacao_id: 'cotacao-1',
                tipo_combustivel: 'Gasolina',
                quantidade_autorizada: 30,
                posto_abastecimento: 'Posto Central',
                validade_ate: '2026-12-31'
            }
        };

        const res = criarResponse();

        await postOrdemTransporte(req, res);

        expect(emitirOrdemDeTransporte).toHaveBeenCalledWith(
            expect.objectContaining({
                cotacaoId: 'cotacao-1',
                emitidoPor: 'usuario-1',
                tipoCombustivel: 'Gasolina',
                quantidadeAutorizada: 30
            })
        );

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(ordem);
    });

    it('retorna 404 quando a cotação não existe', async () => {
        emitirOrdemDeTransporte.mockResolvedValue({
            data: null,
            error: {
                code: 'COTACAO_NAO_ENCONTRADA',
                message: 'Cotação não encontrada.'
            }
        });

        const req = {
            user: { id: 'usuario-1' },
            body: { cotacao_id: 'inexistente' }
        };

        const res = criarResponse();

        await postOrdemTransporte(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            erro: 'Cotação não encontrada.',
            codigo: 'COTACAO_NAO_ENCONTRADA'
        });
    });

    it('retorna 409 quando já existe uma OT para a cotação', async () => {
        emitirOrdemDeTransporte.mockResolvedValue({
            data: null,
            error: {
                code: 'OT_JA_EXISTE',
                message: 'Já existe uma OT para esta cotação.'
            }
        });

        const req = {
            user: { id: 'usuario-1' },
            body: { cotacao_id: 'cotacao-1' }
        };

        const res = criarResponse();

        await postOrdemTransporte(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it('retorna 500 se o serviço lançar uma exceção', async () => {
        emitirOrdemDeTransporte.mockRejectedValue(
            new Error('Falha inesperada')
        );

        const req = {
            user: { id: 'usuario-1' },
            body: { cotacao_id: 'cotacao-1' }
        };

        const res = criarResponse();

        const consoleError = jest
            .spyOn(console, 'error')
            .mockImplementation(() => {});

        try {
            await postOrdemTransporte(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        } finally {
            consoleError.mockRestore();
        }
    });

    it('lista as Ordens de Transporte e retorna 200', async () => {
        const ordens = [
            { id: 'ot-1', numero: 'OT-001', status: 'pendente' },
            { id: 'ot-2', numero: 'OT-002', status: 'emitida' }
        ];

        listarOrdensDeTransporte.mockResolvedValue({
            data: ordens,
            error: null
        });

        const res = criarResponse();

        await getOrdensTransporte({}, res);

        expect(listarOrdensDeTransporte).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(ordens);
    });

    it('retorna 500 se falhar a listagem de ordens', async () => {
        listarOrdensDeTransporte.mockResolvedValue({
            data: null,
            error: { message: 'Erro no banco' }
        });

        const res = criarResponse();
        const consoleError = jest
            .spyOn(console, 'error')
            .mockImplementation(() => {});

        try {
            await getOrdensTransporte({}, res);

            expect(res.status).toHaveBeenCalledWith(500);
        } finally {
            consoleError.mockRestore();
        }
    });

    it('consulta uma Ordem de Transporte pelo ID', async () => {
        const ordem = {
            id: 'ot-1',
            numero: 'OT-001',
            status: 'pendente',
            cotacao: { id: 'cotacao-1' }
        };

        buscarOrdemDeTransporte.mockResolvedValue({
            data: ordem,
            error: null
        });

        const req = { params: { id: 'ot-1' } };
        const res = criarResponse();

        await getOrdemTransporte(req, res);

        expect(buscarOrdemDeTransporte).toHaveBeenCalledWith('ot-1');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(ordem);
    });

    it('retorna 404 ao consultar uma OT inexistente', async () => {
        buscarOrdemDeTransporte.mockResolvedValue({
            data: null,
            error: {
                code: 'OT_NAO_ENCONTRADA',
                message: 'Ordem de Transporte não encontrada.'
            }
        });

        const req = { params: { id: 'ot-inexistente' } };
        const res = criarResponse();

        await getOrdemTransporte(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            erro: 'Ordem de Transporte não encontrada.',
            codigo: 'OT_NAO_ENCONTRADA'
        });
    });

    it('permite que gestor edite uma OT pendente', async () => {
        const ordemAtualizada = {
            id: 'ot-1',
            status: 'pendente',
            tipo_combustivel: 'Gasolina',
            quantidade_autorizada: 30
        };

        atualizarOrdemDeTransporte.mockResolvedValue({
            data: ordemAtualizada,
            error: null
        });

        const req = {
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: 'ot-1' },
            body: {
                tipo_combustivel: 'Gasolina',
                quantidade_autorizada: 30
            }
        };

        const res = criarResponse();

        await patchOrdemTransporte(req, res);

        expect(atualizarOrdemDeTransporte).toHaveBeenCalledWith({
            id: 'ot-1',
            veiculoPlaca: undefined,
            tipoCombustivel: 'Gasolina',
            quantidadeAutorizada: 30,
            postoAbastecimento: undefined,
            validadeAte: undefined,
            observacoes: undefined
        });

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(ordemAtualizada);
    });

    it('bloqueia edição para usuário que não é gestor', async () => {
        const req = {
            user: { id: 'operador-1', perfil: 'operador' },
            params: { id: 'ot-1' },
            body: { tipo_combustivel: 'Gasolina' }
        };

        const res = criarResponse();

        await patchOrdemTransporte(req, res);

        expect(atualizarOrdemDeTransporte).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            erro: 'Somente gestores podem editar Ordens de Transporte.'
        });
    });

    it('retorna 409 quando a OT não está pendente para edição', async () => {
        atualizarOrdemDeTransporte.mockResolvedValue({
            data: null,
            error: {
                code: 'OT_NAO_PENDENTE',
                message: 'Somente OTs pendentes podem ser editadas.'
            }
        });

        const req = {
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: 'ot-emitida' },
            body: { tipo_combustivel: 'Gasolina' }
        };

        const res = criarResponse();

        await patchOrdemTransporte(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            erro: 'Somente OTs pendentes podem ser editadas.',
            codigo: 'OT_NAO_PENDENTE'
        });
    });

    it('retorna PDF com cabeçalhos de download', async () => {
        const dados = {
            id: 'ot-1',
            numero: 'OT-TESTE',
            voucher: {
                id: 'voucher-1',
                numero_via: 1,
                tipo_via: 'original'
            }
        };

        const pdf = Buffer.from('%PDF-1.4 teste');

        buscarVoucherTransporte.mockResolvedValue({
            data: dados,
            error: null
        });

        buildVoucherTransportePdf.mockReturnValue(pdf);

        nomeArquivoVoucherTransporte.mockReturnValue(
            'OT-TESTE-voucher-via-1.pdf'
        );

        const req = {
            params: {
                id: 'ot-1',
                voucherId: 'voucher-1'
            }
        };

        const res = criarResponse();

        await getVoucherTransportePdf(req, res);

        expect(res.setHeader).toHaveBeenCalledWith(
            'Content-Type',
            'application/pdf'
        );

        expect(res.setHeader).toHaveBeenCalledWith(
            'Content-Disposition',
            'attachment; filename="OT-TESTE-voucher-via-1.pdf"'
        );

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith(pdf);
    });

    it('retorna 404 quando o voucher não existe', async () => {
        buscarVoucherTransporte.mockResolvedValue({
            data: null,
            error: {
                code: 'VOUCHER_NAO_ENCONTRADO',
                message: 'Voucher não encontrado para esta OT.'
            }
        });

        const req = {
            params: {
                id: 'ot-1',
                voucherId: 'inexistente'
            }
        };

        const res = criarResponse();

        await getVoucherTransportePdf(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            erro: 'Voucher não encontrado para esta OT.'
        });
    });

    it('registra a entrega do voucher e retorna 200', async () => {
        const resultado = {
            ordem: {
                id: 'ot-1',
                status: 'entregue'
            },
            voucher: {
                id: 'voucher-1',
                destinatario: 'Lucas'
            }
        };

        registrarEntregaVoucherTransporte.mockResolvedValue({
            data: resultado,
            error: null
        });

        const req = {
            user: { id: 'usuario-1' },
            params: {
                id: 'ot-1',
                voucherId: 'voucher-1'
            },
            body: {
                destinatario: 'Lucas'
            }
        };

        const res = criarResponse();

        await postEntregaVoucherTransporte(req, res);

        expect(registrarEntregaVoucherTransporte).toHaveBeenCalledWith({
            ordemId: 'ot-1',
            voucherId: 'voucher-1',
            entreguePor: 'usuario-1',
            destinatario: 'Lucas'
        });

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(resultado);
    });

    it('retorna 409 quando o voucher já foi entregue', async () => {
        registrarEntregaVoucherTransporte.mockResolvedValue({
            data: null,
            error: {
                code: 'VOUCHER_JA_ENTREGUE',
                message: 'Este voucher já foi entregue.'
            }
        });

        const req = {
            user: { id: 'usuario-1' },
            params: {
                id: 'ot-1',
                voucherId: 'voucher-1'
            },
            body: {
                destinatario: 'Lucas'
            }
        };

        const res = criarResponse();

        await postEntregaVoucherTransporte(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it('gera segunda via e retorna 201', async () => {
        const resultado = {
            id: 'ot-1',
            numero: 'OT-TESTE',
            status: 'entregue',
            voucher: {
                id: 'voucher-2',
                numero_via: 2,
                tipo_via: 'segunda_via',
                codigo: 'VT-SEGUNDA'
            }
        };

        gerarSegundaViaVoucherTransporte.mockResolvedValue({
            data: resultado,
            error: null
        });

        const req = {
            user: { id: 'usuario-1' },
            params: { id: 'ot-1' }
        };

        const res = criarResponse();

        await postSegundaViaVoucherTransporte(req, res);

        expect(gerarSegundaViaVoucherTransporte).toHaveBeenCalledWith({
            ordemId: 'ot-1',
            emitidoPor: 'usuario-1'
        });

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(resultado);
    });

    it('retorna 404 quando a OT da segunda via não existe', async () => {
        gerarSegundaViaVoucherTransporte.mockResolvedValue({
            data: null,
            error: {
                code: 'OT_NAO_ENCONTRADA',
                message: 'Ordem de Transporte não encontrada.'
            }
        });

        const req = {
            user: { id: 'usuario-1' },
            params: { id: 'ot-inexistente' }
        };

        const res = criarResponse();

        await postSegundaViaVoucherTransporte(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            erro: 'Ordem de Transporte não encontrada.',
            codigo: 'OT_NAO_ENCONTRADA'
        });
    });

    it('retorna 409 quando a OT está vencida', async () => {
        gerarSegundaViaVoucherTransporte.mockResolvedValue({
            data: null,
            error: {
                code: 'OT_VENCIDA',
                message: 'A validade da OT expirou.'
            }
        });

        const req = {
            user: { id: 'usuario-1' },
            params: { id: 'ot-vencida' }
        };

        const res = criarResponse();

        await postSegundaViaVoucherTransporte(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it('retorna 409 quando o estado da OT não permite segunda via', async () => {
        gerarSegundaViaVoucherTransporte.mockResolvedValue({
            data: null,
            error: {
                code: 'OT_NAO_PERMITE_SEGUNDA_VIA',
                message: 'O estado atual da OT não permite emitir segunda via.'
            }
        });

        const req = {
            user: { id: 'usuario-1' },
            params: { id: 'ot-finalizada' }
        };

        const res = criarResponse();

        await postSegundaViaVoucherTransporte(req, res);

        expect(res.status).toHaveBeenCalledWith(409);
    });

    it('retorna 500 se o serviço de segunda via lançar uma exceção', async () => {
        gerarSegundaViaVoucherTransporte.mockRejectedValue(
            new Error('Falha inesperada')
        );

        const req = {
            user: { id: 'usuario-1' },
            params: { id: 'ot-1' }
        };

        const res = criarResponse();

        const consoleError = jest
            .spyOn(console, 'error')
            .mockImplementation(() => {});

        try {
            await postSegundaViaVoucherTransporte(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
        } finally {
            consoleError.mockRestore();
        }
    });
});

describe('RF_F11 - listagem de vouchers da OT', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('lista os vouchers e retorna 200', async () => {
        const vouchers = [
            {
                id: 'voucher-1',
                ordem_transporte_id: 'ot-1',
                numero_via: 1,
                tipo_via: 'original'
            },
            {
                id: 'voucher-2',
                ordem_transporte_id: 'ot-1',
                numero_via: 2,
                tipo_via: 'segunda_via'
            }
        ];

        listarVouchersTransporte.mockResolvedValue({
            data: vouchers,
            error: null
        });

        const req = { params: { id: 'ot-1' } };
        const res = criarResponse();

        await getVouchersTransporte(req, res);

        expect(listarVouchersTransporte).toHaveBeenCalledWith('ot-1');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(vouchers);
    });

    it('retorna 404 quando a OT não existe', async () => {
        listarVouchersTransporte.mockResolvedValue({
            data: null,
            error: {
                code: 'OT_NAO_ENCONTRADA',
                message: 'Ordem de Transporte não encontrada.'
            }
        });

        const req = { params: { id: 'inexistente' } };
        const res = criarResponse();

        await getVouchersTransporte(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});
