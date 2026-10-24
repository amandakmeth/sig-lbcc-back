
import { jest } from '@jest/globals';

const db = {
    from: jest.fn(),
    rpc: jest.fn()
};

jest.unstable_mockModule(
    '../src/config/supabaseAdmin.js',
    () => ({ default: db })
);

jest.unstable_mockModule(
    '../src/config/supabase.js',
    () => ({ default: db })
);

const {
    emitirOrdemDeTransporte,
    gerarSegundaViaVoucherTransporte
} = await import(
    '../src/modules/transporte/services/ordensTransporte.service.js'
);

describe('RF_F11 - validação da validade da OT', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const dadosBase = {
        cotacaoId: 'cotacao-1',
        tipoCombustivel: 'Gasolina',
        quantidadeAutorizada: 30,
        postoAbastecimento: 'Posto Central',
        emitidoPor: 'usuario-1'
    };

    it('rejeita uma data inexistente, como 31 de fevereiro', async () => {
        const resultado = await emitirOrdemDeTransporte({
            ...dadosBase,
            validadeAte: '2026-02-31'
        });

        expect(resultado.data).toBeNull();
        expect(resultado.error.message).toMatch(/validade/i);
        expect(db.from).not.toHaveBeenCalled();
    });

    it('rejeita uma data em formato incorreto', async () => {
        const resultado = await emitirOrdemDeTransporte({
            ...dadosBase,
            validadeAte: '31/12/2026'
        });

        expect(resultado.data).toBeNull();
        expect(resultado.error.message).toMatch(/validade/i);
        expect(db.from).not.toHaveBeenCalled();
    });

    it('rejeita uma data passada', async () => {
        const resultado = await emitirOrdemDeTransporte({
            ...dadosBase,
            validadeAte: '2020-01-01'
        });

        expect(resultado.data).toBeNull();
        expect(resultado.error.message).toMatch(/validade/i);
        expect(db.from).not.toHaveBeenCalled();
    });

    it('rejeita uma quantidade autorizada igual a zero', async () => {
        const resultado = await emitirOrdemDeTransporte({
            ...dadosBase,
            quantidadeAutorizada: 0,
            validadeAte: '2026-12-31'
        });

        expect(resultado.data).toBeNull();
        expect(resultado.error.message).toMatch(/quantidade/i);
        expect(db.from).not.toHaveBeenCalled();
    });
});

describe('RF_F11 - geração de segunda via do voucher', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejeita a solicitação sem o ID da OT', async () => {
        const resultado = await gerarSegundaViaVoucherTransporte({
            ordemId: null,
            emitidoPor: 'usuario-1'
        });

        expect(resultado.data).toBeNull();
        expect(resultado.error).toBeTruthy();
        expect(db.rpc).not.toHaveBeenCalled();
    });

    it('rejeita a solicitação sem o usuário emissor', async () => {
        const resultado = await gerarSegundaViaVoucherTransporte({
            ordemId: 'ot-1',
            emitidoPor: null
        });

        expect(resultado.data).toBeNull();
        expect(resultado.error).toBeTruthy();
        expect(db.rpc).not.toHaveBeenCalled();
    });

    it('gera a segunda via por meio da função RPC do Supabase', async () => {
        const ordem = {
            id: 'ot-1',
            numero: 'OT-123',
            status: 'entregue'
        };

        const voucher = {
            id: 'voucher-2',
            ordem_transporte_id: 'ot-1',
            numero_via: 2,
            tipo_via: 'segunda_via',
            codigo: 'VT-SEGUNDA-VIA'
        };

        db.rpc.mockResolvedValueOnce({
            data: {
                ordem,
                voucher
            },
            error: null
        });

        const resultado = await gerarSegundaViaVoucherTransporte({
            ordemId: 'ot-1',
            emitidoPor: 'usuario-1'
        });

        expect(db.rpc).toHaveBeenCalledWith(
            'gerar_segunda_via_voucher_transporte',
            {
                p_ordem_id: 'ot-1',
                p_emitido_por: 'usuario-1'
            }
        );

        expect(resultado.error).toBeNull();
        expect(resultado.data.id).toBe('ot-1');
        expect(resultado.data.voucher.numero_via).toBe(2);
        expect(resultado.data.voucher.tipo_via).toBe('segunda_via');
    });

    it('converte erro de OT inexistente em erro de negócio', async () => {
        db.rpc.mockResolvedValueOnce({
            data: null,
            error: {
                message: 'OT_NAO_ENCONTRADA'
            }
        });

        const resultado = await gerarSegundaViaVoucherTransporte({
            ordemId: 'ot-inexistente',
            emitidoPor: 'usuario-1'
        });

        expect(resultado.data).toBeNull();
        expect(resultado.error.code).toBe('OT_NAO_ENCONTRADA');
    });

    it('converte erro de OT vencida em erro de negócio', async () => {
        db.rpc.mockResolvedValueOnce({
            data: null,
            error: {
                message: 'OT_VENCIDA'
            }
        });

        const resultado = await gerarSegundaViaVoucherTransporte({
            ordemId: 'ot-vencida',
            emitidoPor: 'usuario-1'
        });

        expect(resultado.data).toBeNull();
        expect(resultado.error.code).toBe('OT_VENCIDA');
    });

    it('trata falha inesperada do Supabase sem lançar erro para o chamador', async () => {
        db.rpc.mockResolvedValueOnce({
            data: null,
            error: {
                message: 'ERRO_INTERNO_DO_BANCO'
            }
        });

        const resultado = await gerarSegundaViaVoucherTransporte({
            ordemId: 'ot-1',
            emitidoPor: 'usuario-1'
        });

        expect(resultado.data).toBeNull();
        expect(resultado.error).toBeTruthy();
    });
});
