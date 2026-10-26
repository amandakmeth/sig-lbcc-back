
import { jest } from '@jest/globals';

const fornecimentoServices = {
    gerarOrdensDeFornecimento: jest.fn(),
    listarOrdensDeFornecimento: jest.fn(),
    buscarOrdemDeFornecimento: jest.fn(),
    confirmarRecebimentoOrdemDeFornecimento: jest.fn(),
    listarGestoresResponsaveis: jest.fn(),
    atualizarPrazoOrdem: jest.fn(),
    atualizarStatusPrazoOrdem: jest.fn(),
    finalizarOrdemDeFornecimento: jest.fn(),
    atualizarObservacoesOrdemDeFornecimento: jest.fn()
};

const lembretes = {
    buscarLembreteFornecedor: jest.fn(),
    enviarLembreteFornecedor: jest.fn(),
    LEMBRETE_STATUS: {
        PENDENTE: 'pendente',
        ENVIADO: 'enviado',
        FALHA_RECUPERAVEL: 'falha_recuperavel',
        FALHA_DEFINITIVA: 'falha_definitiva'
    },
    MAX_TENTATIVAS_LEMBRETE: 3
};

const email = {
    agendarEnvioInicial: jest.fn(),
    obterPdfOrdemDeFornecimento: jest.fn(),
    processarEnvioOrdemDeFornecimento: jest.fn(),
    solicitarReenvioOrdemDeFornecimento: jest.fn()
};

const auditoria = {
    registrarOcorrencia: jest.fn(),
    registrarAuditoria: jest.fn()
};

jest.unstable_mockModule('../src/config/supabaseAdmin.js', () => ({
    default: {
        rpc: jest.fn(),
        from: jest.fn()
    }
}));

jest.unstable_mockModule(
    '../src/modules/fornecimento/services/fornecimento.services.js',
    () => fornecimentoServices
);

jest.unstable_mockModule(
    '../src/modules/notificacoes/services/lembretes-fornecedor.service.js',
    () => lembretes
);

jest.unstable_mockModule(
    '../src/modules/fornecimento/services/ordem-fornecimento-email.service.js',
    () => email
);

jest.unstable_mockModule(
    '../src/modules/historico_pacientes/services/auditoria.service.js',
    () => auditoria
);

const {
    confirmarRecebimento,
    atualizarObservacoes
} = await import(
    '../src/modules/fornecimento/controller/fornecimento.controller.js'
);

function criarResponse() {
    const res = {};

    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);

    return res;
}

function criarRequest({
    user = { id: 'gestor-1', perfil: 'gestor' },
    params = { id: 'of-1' },
    body = {}
} = {}) {
    return {
        user,
        params,
        body
    };
}

beforeEach(() => {
    jest.clearAllMocks();

    fornecimentoServices.confirmarRecebimentoOrdemDeFornecimento
        .mockResolvedValue({
            data: {
                id: 'of-1',
                status: 'entregue'
            },
            error: null
        });

    fornecimentoServices.atualizarObservacoesOrdemDeFornecimento
        .mockResolvedValue({
            data: {
                id: 'of-1',
                observacoes: 'Entrega recebida',
                paciente_id: 'paciente-1',
                fornecedor_id: 'fornecedor-1',
                cotacao_id: 'cotacao-1'
            },
            error: null
        });

    lembretes.buscarLembreteFornecedor.mockResolvedValue({
        data: null,
        error: null
    });

    lembretes.enviarLembreteFornecedor.mockResolvedValue({
        data: null,
        error: null
    });

    email.agendarEnvioInicial.mockResolvedValue({
        data: null,
        error: null
    });

    email.obterPdfOrdemDeFornecimento.mockResolvedValue({
        data: null,
        error: null
    });

    email.processarEnvioOrdemDeFornecimento.mockResolvedValue({
        data: null,
        error: null
    });

    email.solicitarReenvioOrdemDeFornecimento.mockResolvedValue({
        data: null,
        error: null
    });

    auditoria.registrarOcorrencia.mockResolvedValue({
        data: null,
        error: null
    });
});

describe('confirmarRecebimento', () => {
    test('1. bloqueia usuário sem perfil autorizado', async () => {
        const req = criarRequest({
            user: {
                id: 'usuario-1',
                perfil: 'prefeitura'
            }
        });

        const res = criarResponse();

        await confirmarRecebimento(req, res);

        expect(res.status).toHaveBeenCalledWith(403);

        expect(
            fornecimentoServices.confirmarRecebimentoOrdemDeFornecimento
        ).not.toHaveBeenCalled();
    });

    test('2. permite ao gestor confirmar o recebimento', async () => {
        const req = criarRequest({
            user: {
                id: 'gestor-1',
                perfil: 'gestor'
            },
            params: {
                id: 'of-1'
            },
            body: {}
        });

        const res = criarResponse();

        await confirmarRecebimento(req, res);

        expect(
            fornecimentoServices.confirmarRecebimentoOrdemDeFornecimento
        ).toHaveBeenCalledWith({
            id: 'of-1',
            atualizadoPor: 'gestor-1',
            canalConfirmacao: null
        });

        expect(res.status).toHaveBeenCalledWith(200);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringMatching(/confirmado com sucesso/i)
            })
        );
    });

    test('3. permite ao operador confirmar o recebimento', async () => {
        const req = criarRequest({
            user: {
                id: 'operador-1',
                perfil: 'operador'
            }
        });

        const res = criarResponse();

        await confirmarRecebimento(req, res);

        expect(
            fornecimentoServices.confirmarRecebimentoOrdemDeFornecimento
        ).toHaveBeenCalled();

        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('4. retorna erro quando o recebimento já foi confirmado', async () => {
        fornecimentoServices.confirmarRecebimentoOrdemDeFornecimento
            .mockResolvedValueOnce({
                data: null,
                error: {
                    message: 'Recebimento já confirmado'
                }
            });

        const req = criarRequest();
        const res = criarResponse();

        await confirmarRecebimento(req, res);

        expect(res.status).toHaveBeenCalledWith(400);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Recebimento já confirmado'
            })
        );
    });

    test('5. encaminha o canal WhatsApp ao serviço', async () => {
        const req = criarRequest({
            body: {
                canal_confirmacao: 'whatsapp'
            }
        });

        const res = criarResponse();

        await confirmarRecebimento(req, res);

        expect(
            fornecimentoServices.confirmarRecebimentoOrdemDeFornecimento
        ).toHaveBeenCalledWith({
            id: 'of-1',
            atualizadoPor: 'gestor-1',
            canalConfirmacao: 'whatsapp'
        });

        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('6. rejeita canal de confirmação inválido', async () => {
        const req = criarRequest({
            body: {
                canal_confirmacao: 'telegram'
            }
        });

        const res = criarResponse();

        await confirmarRecebimento(req, res);

        expect(res.status).toHaveBeenCalledWith(400);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringMatching(/canal de confirmação inválido/i)
            })
        );

        expect(
            fornecimentoServices.confirmarRecebimentoOrdemDeFornecimento
        ).not.toHaveBeenCalled();
    });

    test('7. permite confirmar sem informar o canal', async () => {
        const req = criarRequest({
            body: {}
        });

        const res = criarResponse();

        await confirmarRecebimento(req, res);

        expect(
            fornecimentoServices.confirmarRecebimentoOrdemDeFornecimento
        ).toHaveBeenCalledWith({
            id: 'of-1',
            atualizadoPor: 'gestor-1',
            canalConfirmacao: null
        });

        expect(res.status).toHaveBeenCalledWith(200);
    });

    test('8. retorna erro quando o serviço falha na confirmação', async () => {
        fornecimentoServices.confirmarRecebimentoOrdemDeFornecimento
            .mockResolvedValueOnce({
                data: null,
                error: {
                    message: 'Falha ao confirmar recebimento'
                }
            });

        const req = criarRequest();
        const res = criarResponse();

        await confirmarRecebimento(req, res);

        expect(res.status).toHaveBeenCalledWith(400);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Falha ao confirmar recebimento'
            })
        );
    });
});

describe('atualizarObservacoes', () => {
    test('9. bloqueia usuário sem perfil autorizado', async () => {
        const req = criarRequest({
            user: {
                id: 'consultor-1',
                perfil: 'consultor'
            },
            body: {
                observacoes: 'Entrega recebida'
            }
        });

        const res = criarResponse();

        await atualizarObservacoes(req, res);

        expect(res.status).toHaveBeenCalledWith(403);

        expect(
            fornecimentoServices.atualizarObservacoesOrdemDeFornecimento
        ).not.toHaveBeenCalled();
    });

    test('10. rejeita tentativa de alterar campos protegidos', async () => {
        const req = criarRequest({
            user: {
                id: 'gestor-1',
                perfil: 'gestor'
            },
            body: {
                observacoes: 'Entrega recebida',
                paciente_id: 'paciente-alterado',
                fornecedor_id: 'fornecedor-alterado'
            }
        });

        const res = criarResponse();

        await atualizarObservacoes(req, res);

        expect(res.status).toHaveBeenCalledWith(400);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Envie somente o campo observacoes'
            })
        );

        expect(
            fornecimentoServices.atualizarObservacoesOrdemDeFornecimento
        ).not.toHaveBeenCalled();
    });

    test('11. permite ao gestor atualizar observações sem alterar os vínculos', async () => {
        const req = criarRequest({
            user: {
                id: 'gestor-1',
                perfil: 'gestor'
            },
            params: {
                id: 'of-1'
            },
            body: {
                observacoes: 'Entrega recebida'
            }
        });

        const res = criarResponse();

        await atualizarObservacoes(req, res);

        expect(
            fornecimentoServices.atualizarObservacoesOrdemDeFornecimento
        ).toHaveBeenCalledWith({
            id: 'of-1',
            observacoes: 'Entrega recebida',
            atualizadoPor: 'gestor-1'
        });

        expect(res.status).toHaveBeenCalledWith(200);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringMatching(/atualizadas com sucesso/i),
                data: expect.objectContaining({
                    paciente_id: 'paciente-1',
                    fornecedor_id: 'fornecedor-1',
                    cotacao_id: 'cotacao-1'
                })
            })
        );
    });

    test('12. retorna 404 quando a ordem não é encontrada', async () => {
        fornecimentoServices.atualizarObservacoesOrdemDeFornecimento
            .mockResolvedValueOnce({
                data: null,
                error: {
                    message: 'Ordem de fornecimento não encontrada'
                }
            });

        const req = criarRequest({
            user: {
                id: 'gestor-1',
                perfil: 'gestor'
            },
            params: {
                id: 'of-inexistente'
            },
            body: {
                observacoes: 'Entrega recebida'
            }
        });

        const res = criarResponse();

        await atualizarObservacoes(req, res);

        expect(
            fornecimentoServices.atualizarObservacoesOrdemDeFornecimento
        ).toHaveBeenCalled();

        expect(res.status).toHaveBeenCalledWith(404);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Ordem de fornecimento não encontrada'
            })
        );
    });
});
