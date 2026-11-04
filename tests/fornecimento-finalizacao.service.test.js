
import { jest } from '@jest/globals';

const ordemBase = {
    id: 'of-1',
    numero: 'OF-001',
    paciente_id: 'paciente-1',
    status: 'em_entrega',
    data_previsao_entrega: '2026-10-28',
    prazo_ciclo: 1,
    status_prazo: 'normal'
};

let ordem;
let itens;
let erroBusca;
let erroItens;
let atualizacaoExecutada;
let rpcMock;

const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),

    update: jest.fn((dados) => {
        atualizacaoExecutada = true;
        ordem = { ...ordem, ...dados };
        return builder;
    }),

    single: jest.fn(async () => ({
        data: ordem,
        error: erroBusca
    })),

    maybeSingle: jest.fn(async () => ({
        data: ordem,
        error: null
    })),

    then: undefined
};

const itensBuilder = {
    select: jest.fn(() => itensBuilder),
    eq: jest.fn(async () => ({
        data: itens,
        error: erroItens
    }))
};

const db = {
    from: jest.fn((tabela) => {
        if (tabela === 'ordens_fornecimento') {
            return builder;
        }

        if (tabela === 'ordem_fornecimento_itens') {
            return itensBuilder;
        }

        if (tabela === 'ordem_fornecimento_responsaveis') {
            return {
                select: jest.fn(() => ({
                    eq: jest.fn(async () => ({
                        data: [],
                        error: null
                    }))
                }))
            };
        }

        if (tabela === 'ordem_fornecimento_prazo_historico') {
            return {
                upsert: jest.fn(() => ({
                    select: jest.fn(() => ({
                        maybeSingle: jest.fn(async () => ({
                            data: {},
                            error: null
                        }))
                    }))
                }))
            };
        }

        throw new Error(`Tabela inesperada no teste: ${tabela}`);
    })
};

jest.unstable_mockModule(
    '../src/config/supabase.js',
    () => ({ default: db })
);

jest.unstable_mockModule(
    '../src/config/supabaseAdmin.js',
    () => ({ default: { rpc: (...args) => rpcMock(...args) } })
);

jest.unstable_mockModule(
    '../src/modules/calendario/services/calendario.service.js',
    () => ({
        listarDatasFeriadosAtivos: jest.fn(async () => ({
            data: [],
            error: null
        }))
    })
);

jest.unstable_mockModule(
    '../src/modules/historico_pacientes/services/auditoria.service.js',
    () => ({
        registrarAuditoria: jest.fn(async () => ({ error: null })),
        registrarOcorrencia: jest.fn(async () => ({ error: null }))
    })
);

const { finalizarOrdemDeFornecimento } = await import(
    '../src/modules/fornecimento/services/fornecimento.services.js'
);

describe('RF_F9 - finalização de Ordem de Fornecimento', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        ordem = { ...ordemBase };

        itens = [{
            id: 'item-1',
            descricao: 'Medicamento',
            quantidade_solicitada: 10,
            quantidade_entregue: 10
        }];

        erroBusca = null;
        erroItens = null;
        atualizacaoExecutada = false;
        rpcMock = jest.fn(async (_functionName, args) => {
            atualizacaoExecutada = true;
            ordem = { ...ordem, status: 'finalizada' };
            return { data: { ok: true, ordem }, error: null };
        });
    });

    it('bloqueia a finalização quando há entrega incompleta', async () => {
        itens[0].quantidade_entregue = 5;
        rpcMock.mockResolvedValue({
            data: { ok: false, code: 'ENTREGA_INCOMPLETA', message: 'Existem itens com saldo pendente.' },
            error: null
        });

        const resultado = await finalizarOrdemDeFornecimento({
            id: 'of-1',
            atualizadoPor: 'operador-1'
        });

        expect(resultado.data).toBeNull();
        expect(resultado.error.code).toBe('ENTREGA_INCOMPLETA');
        expect(rpcMock).toHaveBeenCalledTimes(1);
    });

    it('bloqueia a finalização de uma ordem cancelada', async () => {
        ordem.status = 'cancelada';

        const resultado = await finalizarOrdemDeFornecimento({
            id: 'of-1',
            atualizadoPor: 'operador-1'
        });

        expect(resultado.data).toBeNull();
        expect(resultado.error.message).toMatch(/status/i);
        expect(atualizacaoExecutada).toBe(false);
    });

    it('não atualiza novamente uma ordem já finalizada', async () => {
        ordem.status = 'finalizada';

        const resultado = await finalizarOrdemDeFornecimento({
            id: 'of-1',
            atualizadoPor: 'operador-1'
        });

        expect(resultado.error).toBeNull();
        expect(resultado.data).toBeTruthy();
        expect(resultado.data.status).toBe('finalizada');
        expect(atualizacaoExecutada).toBe(false);
    });

    it('bloqueia a finalização quando não existem itens', async () => {
        itens = [];
        rpcMock.mockResolvedValue({
            data: { ok: false, code: 'OF_SEM_ITENS', message: 'A ordem não pode ser finalizada sem itens cadastrados.' },
            error: null
        });

        const resultado = await finalizarOrdemDeFornecimento({
            id: 'of-1',
            atualizadoPor: 'operador-1'
        });

        expect(resultado.data).toBeNull();
        expect(resultado.error.message).toMatch(/sem itens cadastrados/i);
        expect(atualizacaoExecutada).toBe(false);
    });

    it('tenta finalizar uma ordem quando todos os itens foram entregues', async () => {
       const resultado = await finalizarOrdemDeFornecimento({
    id: 'of-1',
    atualizadoPor: 'operador-1',
    enviarRecibo: jest.fn().mockResolvedValue({
        data: { status: 'enviado' },
        error: null
    })
});

        expect(atualizacaoExecutada).toBe(true);

        expect(rpcMock).toHaveBeenCalledWith(
            'finalizar_ordem_fornecimento_com_divergencias',
            { p_ordem_id: 'of-1', p_usuario_id: 'operador-1' }
        );

        expect(resultado.error).toBeNull();
        expect(resultado.data).toBeTruthy();
    });
});
