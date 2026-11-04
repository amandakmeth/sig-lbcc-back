import { jest } from '@jest/globals';

const rpc = jest.fn();
const supabaseAdmin = { rpc };

jest.unstable_mockModule('../src/config/supabaseAdmin.js', () => ({ default: supabaseAdmin }));

const {
    criarDivergencia,
    decidirCancelamento,
    solicitarCancelamento,
    transicionarDivergencia
} = await import('../src/modules/divergencias/services/divergencias.service.js');

describe('RF_F13 / RF_F14 - gestao de divergencias e cancelamentos', () => {
    beforeEach(() => jest.clearAllMocks());

    it('valida dados obrigatorios antes de chamar a persistencia', async () => {
        const result = await criarDivergencia({
            tipoOrdem: 'OF', ordemId: 'of-1', tipo: 'nao-classificado', descricao: '',
            impeditiva: true, usuarioId: 'usuario-1', idempotencyKey: 'request-1'
        });

        expect(result.error.code).toBe('DADOS_OBRIGATORIOS');
        expect(rpc).not.toHaveBeenCalled();
    });

    it('encaminha divergencia valida ao RPC com descricao normalizada e chave idempotente', async () => {
        rpc.mockResolvedValue({ data: { ok: true, id: 'divergencia-1' }, error: null });

        const result = await criarDivergencia({
            tipoOrdem: 'OF', ordemId: 'of-1', tipo: 'fornecimento_parcial',
            descricao: '  Entrega parcial  ', impeditiva: false,
            dados: { item_id: 'item-1' }, usuarioId: 'usuario-1', idempotencyKey: 'request-1'
        });

        expect(result.data.id).toBe('divergencia-1');
        expect(rpc).toHaveBeenCalledWith('criar_divergencia_ordem', expect.objectContaining({
            p_tipo_ordem: 'OF', p_ordem_id: 'of-1', p_tipo: 'fornecimento_parcial',
            p_descricao: 'Entrega parcial', p_impeditiva: false,
            p_usuario_id: 'usuario-1', p_idempotency_key: 'request-1'
        }));
    });

    it('encaminha transicao de estado com justificativa e comprovacao para auditoria', async () => {
        rpc.mockResolvedValue({ data: { ok: true, status: 'resolvida' }, error: null });

        const result = await transicionarDivergencia({
            id: 'divergencia-1', status: 'resolvida', justificativa: 'Regularizada',
            comprovacao: 'Nota anexada', usuarioId: 'gestor-1'
        });

        expect(result.data.status).toBe('resolvida');
        expect(rpc).toHaveBeenCalledWith('transicionar_divergencia_ordem', {
            p_divergencia_id: 'divergencia-1', p_novo_status: 'resolvida',
            p_justificativa: 'Regularizada', p_comprovacao: 'Nota anexada', p_usuario_id: 'gestor-1'
        });
    });

    it('mantem pedido de cancelamento separado da decisao gerencial', async () => {
        rpc.mockResolvedValueOnce({ data: { ok: true, status: 'solicitada' }, error: null })
            .mockResolvedValueOnce({ data: { ok: true, status: 'recusada' }, error: null });

        const pedido = await solicitarCancelamento({ id: 'divergencia-1', motivo: 'Erro de emissao', usuarioId: 'operador-1' });
        const decisao = await decidirCancelamento({ id: 'cancelamento-1', aprovado: false, justificativa: 'Ordem em execucao', usuarioId: 'gestor-1' });

        expect(pedido.data.status).toBe('solicitada');
        expect(decisao.data.status).toBe('recusada');
        expect(rpc).toHaveBeenNthCalledWith(1, 'solicitar_cancelamento_por_divergencia', {
            p_divergencia_id: 'divergencia-1', p_motivo: 'Erro de emissao', p_usuario_id: 'operador-1'
        });
        expect(rpc).toHaveBeenNthCalledWith(2, 'decidir_cancelamento_ordem', {
            p_solicitacao_id: 'cancelamento-1', p_aprovado: false,
            p_justificativa: 'Ordem em execucao', p_usuario_id: 'gestor-1'
        });
    });
});
