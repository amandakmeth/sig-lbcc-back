
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

function configurarCenarioEmissao({
    ordemExistente = null,
    erroVoucher = null,
    erroReversao = null
} = {}) {
    const operacoes = [];

    const cotacao = {
        id: 'cotacao-1',
        numero: 'COT-001',
        status: 'finalizada',
        ativo: true,
        data_validade: '2099-12-31',
        paciente_id: 'paciente-1',
        area_id: 'area-1',
        fornecedor_vencedor_id: 'fornecedor-1'
    };

    const area = {
        id: 'area-1',
        nome: 'Transporte urbano',
        descricao: 'Transporte urbano',
        ativo: true
    };

    const itens = [
        {
            id: 'cotacao-item-1',
            cotacao_id: 'cotacao-1',
            descricao: 'Transporte',
            quantidade: 1
        }
    ];

    const propostas = [
        {
            id: 'proposta-1',
            fornecedor_id: 'fornecedor-1',
            cotacao_proposta_itens: [
                {
                    id: 'proposta-item-1',
                    cotacao_item_id: 'cotacao-item-1',
                    item_id: 'cotacao-item-1',
                    selecionada: true,
                    selecionado: true
                }
            ]
        }
    ];

    const fornecedor = {
        id: 'fornecedor-1',
        razao_social: 'Fornecedor Teste',
        nome_fantasia: 'Fornecedor Teste',
        ativo: true
    };

    const ordemEmitida = {
        id: ordemExistente?.id || 'ot-1',
        numero: ordemExistente?.numero || 'OT-001',
        cotacao_id: 'cotacao-1',
        paciente_id: 'paciente-1',
        fornecedor_id: 'fornecedor-1',
        status: 'emitida'
    };

    const voucher = {
        id: 'voucher-1',
        ordem_transporte_id: ordemEmitida.id,
        numero_via: 1,
        tipo_via: 'original',
        codigo: 'VT-TESTE'
    };

    const passos = [
        {
            tabela: 'cotacoes',
            resultado: { data: cotacao, error: null }
        },
        {
            tabela: 'areas',
            resultado: { data: area, error: null }
        },
        {
            tabela: 'cotacao_itens',
            resultado: { data: itens, error: null }
        },
        {
            tabela: 'cotacao_propostas',
            resultado: { data: propostas, error: null }
        },
        {
            tabela: 'fornecedores',
            resultado: { data: fornecedor, error: null }
        },
        {
            tabela: 'ordens_transporte',
            resultado: { data: ordemExistente, error: null }
        }
    ];

    if (ordemExistente) {
        passos.push({
            tabela: 'ordens_transporte',
            resultado: { data: ordemEmitida, error: null }
        });
    } else {
        passos.push({
            tabela: 'ordens_transporte',
            resultado: { data: ordemEmitida, error: null }
        });
    }

    passos.push({
        tabela: 'ordem_transporte_vouchers',
        resultado: erroVoucher
            ? { data: null, error: erroVoucher }
            : { data: voucher, error: null }
    });

    if (erroVoucher) {
        passos.push({
            tabela: 'ordens_transporte',
            resultado: { error: erroReversao }
        });
    }

    db.from.mockImplementation((tabela) => {
        const passo = passos.shift();

        if (!passo) {
            throw new Error(`Consulta inesperada: ${tabela}`);
        }

        if (tabela !== passo.tabela) {
            throw new Error(
                `Esperada a tabela "${passo.tabela}", recebida "${tabela}"`
            );
        }

        const query = {
            select: jest.fn(() => query),
            eq: jest.fn(() => query),
            insert: jest.fn((dados) => {
                operacoes.push({ tabela, tipo: 'insert', dados });
                return query;
            }),
            update: jest.fn((dados) => {
                operacoes.push({ tabela, tipo: 'update', dados });
                return query;
            }),
            maybeSingle: jest.fn(async () => passo.resultado),
            single: jest.fn(async () => passo.resultado),
            then: (resolve, reject) =>
                Promise.resolve(passo.resultado).then(resolve, reject)
        };

        return query;
    });

    return { operacoes, ordemEmitida, voucher };
}

describe('RF_F11 - emissão da OT e voucher original', () => {
    const dadosBase = {
        cotacaoId: 'cotacao-1',
        tipoCombustivel: 'Gasolina',
        quantidadeAutorizada: 30,
        postoAbastecimento: 'Posto Central',
        validadeAte: '2099-12-31',
        emitidoPor: 'usuario-1'
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('emite a OT e retorna o voucher original', async () => {
        const { ordemEmitida, voucher } = configurarCenarioEmissao();

        const resultado = await emitirOrdemDeTransporte(dadosBase);

        expect(resultado.error).toBeNull();
        expect(resultado.data.status).toBe('emitida');
        expect(resultado.data.id).toBe(ordemEmitida.id);
        expect(resultado.data.vouchers).toEqual([voucher]);
        expect(db.from).toHaveBeenCalledWith(
            'ordem_transporte_vouchers'
        );
    });

    it('cancela a OT recém-criada se falhar a gravação do voucher', async () => {
        const { operacoes } = configurarCenarioEmissao({
            erroVoucher: { message: 'Falha simulada ao gravar voucher' }
        });

        const resultado = await emitirOrdemDeTransporte(dadosBase);

        expect(resultado.data).toBeNull();
        expect(resultado.error.code).toBe('FALHA_AO_CRIAR_VOUCHER');

        const atualizacoes = operacoes.filter(
            (op) => op.tabela === 'ordens_transporte'
                && op.tipo === 'update'
        );

        expect(atualizacoes).toHaveLength(1);
        expect(atualizacoes[0].dados.status).toBe('cancelada');
    });

    it('tenta restaurar a OT pendente se falhar a gravação do voucher', async () => {
        const ordemPendente = {
            id: 'ot-existente',
            numero: 'OT-PENDENTE-001',
            cotacao_id: 'cotacao-1',
            paciente_id: 'paciente-1',
            fornecedor_id: 'fornecedor-1',
            status: 'pendente'
        };

        const { operacoes } = configurarCenarioEmissao({
            ordemExistente: ordemPendente,
            erroVoucher: { message: 'Falha simulada ao gravar voucher' }
        });

        const resultado = await emitirOrdemDeTransporte(dadosBase);

        expect(resultado.data).toBeNull();
        expect(resultado.error.code).toBe('FALHA_AO_CRIAR_VOUCHER');

        const atualizacoes = operacoes.filter(
            (op) => op.tabela === 'ordens_transporte'
                && op.tipo === 'update'
        );

        expect(atualizacoes).toHaveLength(2);
        expect(atualizacoes[1].dados.status).toBe('pendente');
    });

    it('informa quando também falha a reversão da OT', async () => {
        configurarCenarioEmissao({
            erroVoucher: { message: 'Falha simulada ao gravar voucher' },
            erroReversao: { message: 'Falha simulada na reversão' }
        });

        const resultado = await emitirOrdemDeTransporte(dadosBase);

        expect(resultado.data).toBeNull();
        expect(resultado.error.code).toBe('FALHA_AO_CRIAR_VOUCHER');
        expect(resultado.error.erroReversao).toBe(
            'Falha simulada na reversão'
        );
    });
});
