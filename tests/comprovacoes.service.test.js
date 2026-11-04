import { jest } from '@jest/globals';

const rpc = jest.fn();
const dados = {
    ordem_fornecimento_itens: [],
    comprovacoes_of: [],
    comprovacoes_of_itens: [],
    ordem_evidencias: [],
    utilizacoes_voucher_ot: [],
    ordem_transporte_vouchers: []
};

function builderFor(table) {
    const builder = {
        select: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        order: jest.fn(() => builder),
        in: jest.fn(() => builder),
        then: (resolve, reject) => Promise.resolve({ data: dados[table] || [], error: null }).then(resolve, reject)
    };
    return builder;
}

const supabaseAdmin = {
    rpc,
    from: jest.fn((table) => builderFor(table)),
    storage: {
        from: jest.fn(() => ({
            upload: jest.fn(async () => ({ error: null })),
            remove: jest.fn(async () => ({ error: null })),
            createSignedUrl: jest.fn(async () => ({ data: { signedUrl: 'https://signed.test' }, error: null }))
        }))
    }
};

jest.unstable_mockModule('../src/config/supabaseAdmin.js', () => ({ default: supabaseAdmin }));

const { listarComprovacoesOF, registrarComprovacaoOF, registrarUtilizacaoOT } = await import(
    '../src/modules/comprovacoes/services/comprovacoes.service.js'
);

describe('RF_F12 - comprovacoes de OF e OT', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        for (const key of Object.keys(dados)) dados[key] = [];
    });

    it('acumula duas comprovacoes parciais e preserva ambos os registros', async () => {
        dados.ordem_fornecimento_itens = [
            { id: 'item-a', descricao: 'Item A', unidade: 'un', quantidade_solicitada: 10, quantidade_entregue: 10, quantidade_entregue_legado: 0 },
            { id: 'item-b', descricao: 'Item B', unidade: 'cx', quantidade_solicitada: 5, quantidade_entregue: 2, quantidade_entregue_legado: 0 }
        ];
        dados.comprovacoes_of = [
            { id: 'comprovacao-1', data_execucao: '2026-11-01', created_at: '2026-11-01T12:00:00Z' },
            { id: 'comprovacao-2', data_execucao: '2026-11-02', created_at: '2026-11-02T12:00:00Z' }
        ];
        dados.comprovacoes_of_itens = [
            { comprovacao_id: 'comprovacao-1', ordem_fornecimento_item_id: 'item-a', quantidade: 7 },
            { comprovacao_id: 'comprovacao-2', ordem_fornecimento_item_id: 'item-a', quantidade: 3 },
            { comprovacao_id: 'comprovacao-1', ordem_fornecimento_item_id: 'item-b', quantidade: 2 }
        ];

        const result = await listarComprovacoesOF('of-1');

        expect(result.error).toBeNull();
        expect(result.data.comprovacoes).toHaveLength(2);
        expect(result.data.itens.find((item) => item.id === 'item-a')).toMatchObject({
            quantidade_comprovada: 10,
            saldo: 0,
            status_atendimento: 'integral'
        });
        expect(result.data.itens.find((item) => item.id === 'item-b')).toMatchObject({
            quantidade_comprovada: 2,
            saldo: 3,
            status_atendimento: 'parcial'
        });
        expect(result.data.comprovacoes.find((item) => item.id === 'comprovacao-1').itens).toHaveLength(2);
        expect(result.data.comprovacoes.find((item) => item.id === 'comprovacao-2').itens).toHaveLength(1);
    });

    it('envia o histórico da operação ao RPC e retorna submissão repetida sem criar linha local', async () => {
        rpc.mockResolvedValue({ data: { ok: true, kind: 'comprovacao', repetida: true, id: 'comprovacao-1' }, error: null });
        const input = {
            ordemId: 'of-1',
            dataExecucao: '2026-11-03',
            responsavelExecucaoNome: 'Equipe de execução',
            observacoes: 'Atendimento conferido',
            itens: [{ item_id: 'item-a', quantidade: 3 }],
            evidencias: [],
            usuarioId: 'usuario-1',
            idempotencyKey: 'request-1'
        };

        const result = await registrarComprovacaoOF(input);

        expect(rpc).toHaveBeenCalledWith('registrar_comprovacao_of', expect.objectContaining({
            p_ordem_id: 'of-1',
            p_data_execucao: '2026-11-03',
            p_itens: input.itens,
            p_idempotency_key: 'request-1'
        }));
        expect(result.data).toMatchObject({ repetida: true, id: 'comprovacao-1' });
    });

    it('encaminha divergencia do RPC OT sem contabilizar utilizacao', async () => {
        rpc.mockResolvedValue({ data: { ok: true, kind: 'divergencia', id: 'divergencia-1', tipo: 'quantidade_excedente' }, error: null });

        const result = await registrarUtilizacaoOT({
            ordemId: 'ot-1', voucherId: 'voucher-1', dataUtilizacao: '2026-11-03T14:00:00-03:00',
            posto: 'Posto autorizado', quantidade: 2, evidencias: [], usuarioId: 'usuario-1', idempotencyKey: 'request-ot-1'
        });

        expect(result.error).toBeNull();
        expect(result.data).toMatchObject({ kind: 'divergencia', id: 'divergencia-1', tipo: 'quantidade_excedente' });
        expect(rpc).toHaveBeenCalledWith('registrar_utilizacao_voucher_ot', expect.objectContaining({ p_ordem_id: 'ot-1', p_voucher_id: 'voucher-1', p_quantidade: 2 }));
    });

    it('rejeita utilizacao acima da precisao persistida antes do RPC', async () => {
        const result = await registrarUtilizacaoOT({
            ordemId: 'ot-1', voucherId: 'voucher-1', dataUtilizacao: '2026-11-03T14:00:00-03:00',
            posto: 'Posto autorizado', quantidade: 1.2345, evidencias: [], usuarioId: 'usuario-1', idempotencyKey: 'request-ot-2'
        });

        expect(result.error.code).toBe('DADOS_INVALIDOS');
        expect(rpc).not.toHaveBeenCalled();
    });
});
