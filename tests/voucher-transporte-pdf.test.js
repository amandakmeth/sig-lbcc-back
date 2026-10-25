import {
    buildVoucherTransportePdf,
    nomeArquivoVoucherTransporte
} from '../src/modules/transporte/services/voucher-transporte-pdf.service.js';

describe('RF_F11 - PDF do voucher de transporte', () => {
    const ordem = {
        id: 'ot-1',
        numero: 'OT-20261024-ABC123',
        paciente: { nome: 'Maria da Silva' },
        fornecedor: { nome_fantasia: 'Posto Exemplo' },
        tipo_combustivel: 'Gasolina',
        quantidade_autorizada: 30,
        posto_abastecimento: 'Posto Central',
        veiculo_placa: 'ABC1D23',
        data_emissao: '2026-10-24T12:00:00.000Z',
        validade_ate: '2026-10-31',
        status: 'emitida',
        observacoes: 'Abastecimento autorizado'
    };

    const voucher = {
        codigo: 'VT-ABC123',
        tipo_via: 'original',
        numero_via: 1
    };

    it('gera um PDF válido como Buffer', () => {
        const pdf = buildVoucherTransportePdf(ordem, voucher);

        expect(Buffer.isBuffer(pdf)).toBe(true);
        expect(pdf.subarray(0, 8).toString('ascii')).toBe('%PDF-1.4');
        expect(pdf.toString('binary')).toContain('%%EOF');
    });

    it('inclui os dados principais do voucher no PDF', () => {
        const pdf = buildVoucherTransportePdf(ordem, voucher);
        const conteudo = pdf.toString('binary');

        expect(conteudo).toContain('OT-20261024-ABC123');
        expect(conteudo).toContain('VT-ABC123');
        expect(conteudo).toContain('Maria da Silva');
        expect(conteudo).toContain('Posto Central');
        expect(conteudo).toContain('ABC1D23');
    });

    it('gera nome de arquivo identificando a via', () => {
        expect(nomeArquivoVoucherTransporte(ordem, voucher))
            .toBe('OT-20261024-ABC123-voucher-via-1.pdf');
    });

    it('identifica corretamente a segunda via', () => {
        const segundaVia = {
            ...voucher,
            tipo_via: 'segunda_via',
            numero_via: 2
        };

        expect(nomeArquivoVoucherTransporte(ordem, segundaVia))
            .toBe('OT-20261024-ABC123-voucher-via-2.pdf');
    });
});
