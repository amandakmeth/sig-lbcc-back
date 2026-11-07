import { jest } from '@jest/globals';

const rpc = jest.fn();
const from = jest.fn();

const supabaseAdmin = { rpc, from };

const criarNotificacaoInterna = jest.fn();
const listarGestoresResponsaveis = jest.fn();
const send = jest.fn();
const createSmtpAdapter = jest.fn(() => ({ send }));

jest.unstable_mockModule('../src/config/supabaseAdmin.js', () => ({
    default: supabaseAdmin
}));

jest.unstable_mockModule(
    '../src/modules/notificacoes/services/smtp.adapter.js',
    () => ({ createSmtpAdapter })
);

jest.unstable_mockModule(
    '../src/modules/notificacoes/services/notificacoes.service.js',
    () => ({
        criarNotificacaoInterna,
        NOTIFICACAO_TIPO: {
            CANCELAMENTO_ORDEM_SOLICITADO: 'cancelamento_ordem_solicitado'
        }
    })
);

jest.unstable_mockModule(
    '../src/modules/fornecimento/services/fornecimento.services.js',
    () => ({ listarGestoresResponsaveis })
);

const {
    solicitarCancelamentoOrdem,
    decidirCancelamentoOrdem
} = await import(
    '../src/modules/fornecimento/services/cancelamento-notificacao.service.js'
);

describe('RF14 - cancelamento direto de ordens', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        listarGestoresResponsaveis.mockResolvedValue({
            data: [{ id: 'gestor-1' }],
            error: null
        });

        criarNotificacaoInterna.mockResolvedValue({ error: null });
        send.mockResolvedValue({});
    });

    it('solicita cancelamento de OF via RPC e notifica gestores', async () => {
        rpc.mockResolvedValue({
            data: { ok: true, solicitacao: { id: 'solicitacao-1' } },
            error: null
        });

        const result = await solicitarCancelamentoOrdem({
            ordemFornecimentoId: 'of-1',
            motivo: 'Fornecedor não consegue atender',
            necessidadePaciente: 'continua',
            usuarioId: 'usuario-1'
        });

        expect(rpc).toHaveBeenCalledWith(
            'solicitar_cancelamento_ordem_rf14',
            expect.objectContaining({
                p_ordem_fornecimento_id: 'of-1',
                p_ordem_transporte_id: null,
                p_motivo: 'Fornecedor não consegue atender',
                p_necessidade_paciente: 'continua',
                p_usuario_id: 'usuario-1'
            })
        );

        expect(criarNotificacaoInterna).toHaveBeenCalledWith(
            expect.objectContaining({
                destinatarioId: 'gestor-1',
                dados: expect.objectContaining({
                    solicitacao_id: 'solicitacao-1',
                    ordem_id: 'of-1'
                })
            })
        );

        expect(result.solicitacao).toEqual({
            ok: true,
            solicitacao: { id: 'solicitacao-1' }
        });
        expect(result.notificacao.notificacoesEnviadas).toBe(1);
    });

    it('solicita cancelamento de OT via RPC', async () => {
        rpc.mockResolvedValue({
            data: { ok: true, id: 'solicitacao-2' },
            error: null
        });

        const result = await solicitarCancelamentoOrdem({
            ordemTransporteId: 'ot-1',
            motivo: 'Benefício não será mais utilizado',
            necessidadePaciente: 'encerrada',
            usuarioId: 'usuario-1'
        });

        expect(rpc).toHaveBeenCalledWith(
            'solicitar_cancelamento_ordem_rf14',
            expect.objectContaining({
                p_ordem_fornecimento_id: null,
                p_ordem_transporte_id: 'ot-1',
                p_necessidade_paciente: 'encerrada'
            })
        );

        expect(result.solicitacao.ok).toBe(true);
    });

    it('propaga erro retornado pelo RPC ao solicitar cancelamento', async () => {
        rpc.mockResolvedValue({
            data: null,
            error: { message: 'Falha no banco' }
        });

        await expect(
            solicitarCancelamentoOrdem({
                ordemFornecimentoId: 'of-1',
                motivo: 'Motivo',
                necessidadePaciente: 'continua',
                usuarioId: 'usuario-1'
            })
        ).rejects.toMatchObject({ message: 'Falha no banco' });

        expect(listarGestoresResponsaveis).not.toHaveBeenCalled();
    });

    it('rejeita solicitação quando a RPC retorna ok false', async () => {
        rpc.mockResolvedValue({
            data: { ok: false, message: 'Ordem não pode ser cancelada.' },
            error: null
        });

        await expect(
            solicitarCancelamentoOrdem({
                ordemFornecimentoId: 'of-1',
                motivo: 'Motivo',
                necessidadePaciente: 'continua',
                usuarioId: 'usuario-1'
            })
        ).rejects.toThrow('Ordem não pode ser cancelada.');
    });

    it('não desfaz a solicitação quando falha a notificação dos gestores', async () => {
        rpc.mockResolvedValue({
            data: { ok: true, solicitacao: { id: 'solicitacao-3' } },
            error: null
        });
        listarGestoresResponsaveis.mockRejectedValue(
            new Error('Falha ao consultar gestores')
        );

        const result = await solicitarCancelamentoOrdem({
            ordemFornecimentoId: 'of-1',
            motivo: 'Motivo',
            necessidadePaciente: 'continua',
            usuarioId: 'usuario-1'
        });

        expect(result.solicitacao.ok).toBe(true);
        expect(result.notificacao.erro).toBe('Falha ao consultar gestores');
    });

    it('decide cancelamento via RPC e notifica fornecedor da OF aprovada', async () => {
        rpc.mockResolvedValue({
            data: {
                ok: true,
                solicitacao: {
                    ordem_fornecimento_id: 'of-1',
                    ordem_transporte_id: null
                }
            },
            error: null
        });

        const builder = {
            select: jest.fn(() => builder),
            eq: jest.fn(() => builder),
            single: jest.fn().mockResolvedValue({
                data: {
                    id: 'of-1',
                    numero: 'OF-001',
                    fornecedores: {
                        nome_fantasia: 'Fornecedor Teste',
                        razao_social: 'Fornecedor Teste LTDA',
                        email: 'fornecedor@email.com'
                    }
                },
                error: null
            })
        };

        from.mockReturnValue(builder);

        const result = await decidirCancelamentoOrdem({
            solicitacaoId: 'solicitacao-1',
            aprovado: true,
            justificativa: 'Cancelamento autorizado',
            usuarioId: 'gestor-1'
        });

        expect(rpc).toHaveBeenCalledWith(
            'decidir_cancelamento_ordem_rf14',
            expect.objectContaining({
                p_solicitacao_id: 'solicitacao-1',
                p_aprovado: true,
                p_justificativa: 'Cancelamento autorizado',
                p_usuario_id: 'gestor-1'
            })
        );

        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({
                to: 'fornecedor@email.com',
                subject: 'Cancelamento da Ordem de Fornecimento OF-001'
            })
        );

        expect(result.notificacaoFornecedor).toMatchObject({
            enviada: true,
            destinatario: 'fornecedor@email.com'
        });
    });

    it('não consulta fornecedor quando o cancelamento é recusado', async () => {
        rpc.mockResolvedValue({
            data: { ok: true, solicitacao: {} },
            error: null
        });

        const result = await decidirCancelamentoOrdem({
            solicitacaoId: 'solicitacao-1',
            aprovado: false,
            justificativa: 'Solicitação não autorizada',
            usuarioId: 'gestor-1'
        });

        expect(from).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
        expect(result.notificacaoFornecedor.enviada).toBe(false);
    });

    it('não desfaz a decisão aprovada quando falha o envio ao fornecedor', async () => {
        rpc.mockResolvedValue({
            data: {
                ok: true,
                solicitacao: {
                    ordem_fornecimento_id: 'of-1',
                    ordem_transporte_id: null
                }
            },
            error: null
        });

        const builder = {
            select: jest.fn(() => builder),
            eq: jest.fn(() => builder),
            single: jest.fn().mockResolvedValue({
                data: {
                    id: 'of-1',
                    numero: 'OF-001',
                    fornecedores: { email: null }
                },
                error: null
            })
        };

        from.mockReturnValue(builder);

        const result = await decidirCancelamentoOrdem({
            solicitacaoId: 'solicitacao-1',
            aprovado: true,
            justificativa: 'Autorizado',
            usuarioId: 'gestor-1'
        });

        expect(result.ok).toBe(true);
        expect(result.notificacaoFornecedor.erro).toBe(
            'Fornecedor sem e-mail cadastrado.'
        );
    });
});
