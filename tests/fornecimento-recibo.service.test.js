
import { jest } from '@jest/globals';

const db = {
    from: jest.fn()
};

jest.unstable_mockModule(
    '../src/config/supabaseAdmin.js',
    () => ({ default: db })
);

const registrarAuditoria = jest.fn(async () => ({
    data: {},
    error: null
}));

jest.unstable_mockModule(
    '../src/modules/historico_pacientes/services/auditoria.service.js',
    () => ({ registrarAuditoria })
);

jest.unstable_mockModule(
    '../src/modules/notificacoes/services/smtp.adapter.js',
    () => ({
        createSmtpAdapter: jest.fn()
    })
);

jest.unstable_mockModule(
    '../src/modules/fornecimento/services/ordem-fornecimento-pdf.service.js',
    () => ({
        buildReceiptPdf: jest.fn(() => Buffer.from('PDF de teste')),
        nomeArquivoReciboPdf: jest.fn(() => 'recibo-teste.pdf')
    })
);

const {
    enviarReciboFinalizacaoOF,
    reenviarReciboFinalizacaoOF
} = await import(
    '../src/modules/fornecimento/services/fornecimento-recibo.service.js'
);

describe('RF_F9 - serviço de recibo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    function prepararConsultaOrdem(ordem) {
        const query = {
            select: jest.fn(),
            eq: jest.fn(),
            maybeSingle: jest.fn()
        };

        query.select.mockReturnValue(query);
        query.eq.mockReturnValue(query);
        query.maybeSingle.mockResolvedValue({
            data: ordem,
            error: null
        });

        return query;
    }

    function prepararConsultaRecibo(recibos, reciboExistente = null) {
        const query = {
            upsert: jest.fn(),
            update: jest.fn(),
            select: jest.fn(),
            single: jest.fn(),
            maybeSingle: jest.fn(),
            eq: jest.fn()
        };

        query.upsert.mockReturnValue(query);
        query.update.mockReturnValue(query);
        query.select.mockReturnValue(query);
        query.eq.mockReturnValue(query);

        query.maybeSingle.mockResolvedValue({
            data: reciboExistente,
            error: null
        });

        for (const recibo of recibos) {
            query.single.mockResolvedValueOnce({
                data: recibo,
                error: null
            });
        }

        return query;
    }

    function ordemFinalizada() {
        return {
            id: 'of-1',
            numero: 'OF-001',
            status: 'finalizada',
            data_finalizacao: '2026-10-25T12:00:00.000Z',
            fornecedores: {
                nome_fantasia: 'Fornecedor Teste',
                email: 'fornecedor@exemplo.com'
            },
            ordem_fornecimento_itens: []
        };
    }

    it('envia o recibo e atualiza o status para enviado', async () => {
        const reciboInicial = {
            id: 'recibo-1',
            tentativas: 0
        };

        const reciboEnviado = {
            id: 'recibo-1',
            status: 'enviado',
            tentativas: 1
        };

        const queryOrdem = prepararConsultaOrdem(ordemFinalizada());
        const queryRecibo = prepararConsultaRecibo([
            reciboInicial,
            reciboEnviado
        ]);

        db.from.mockImplementation((tabela) => {
            if (tabela === 'ordens_fornecimento') return queryOrdem;
            if (tabela === 'ordens_fornecimento_recibos') return queryRecibo;

            throw new Error(`Tabela inesperada: ${tabela}`);
        });

        const adapter = {
            send: jest.fn().mockResolvedValue({
                messageId: 'mensagem-123'
            })
        };

        const resultado = await enviarReciboFinalizacaoOF({
            ordemId: 'of-1',
            usuarioId: 'operador-1',
            db,
            adapter
        });

        expect(adapter.send).toHaveBeenCalledTimes(1);

        expect(adapter.send).toHaveBeenCalledWith(
            expect.objectContaining({
                to: 'fornecedor@exemplo.com',
                attachments: [
                    expect.objectContaining({
                        filename: 'recibo-teste.pdf',
                        contentType: 'application/pdf'
                    })
                ]
            })
        );

        expect(queryRecibo.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                ordem_fornecimento_id: 'of-1',
                status: 'enviando'
            }),
            { onConflict: 'ordem_fornecimento_id' }
        );

        expect(queryRecibo.update).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'enviado',
                message_id: 'mensagem-123',
                tentativas: 1
            })
        );

        expect(resultado.error).toBeNull();
        expect(resultado.data.status).toBe('enviado');
    });

    it('bloqueia o envio quando a OF não está finalizada', async () => {
        const query = prepararConsultaOrdem({
            id: 'of-1',
            numero: 'OF-001',
            status: 'em_entrega',
            fornecedores: {
                email: 'fornecedor@exemplo.com'
            }
        });

        db.from.mockReturnValue(query);

        const adapter = {
            send: jest.fn()
        };

        const resultado = await enviarReciboFinalizacaoOF({
            ordemId: 'of-1',
            db,
            adapter
        });

        expect(resultado.error.code).toBe('OF_NAO_FINALIZADA');
        expect(adapter.send).not.toHaveBeenCalled();
        expect(db.from).toHaveBeenCalledTimes(1);
    });

    it('registra a falha quando o SMTP rejeita o envio', async () => {
        const reciboInicial = {
            id: 'recibo-1',
            tentativas: 0
        };

        const reciboFalhou = {
            id: 'recibo-1',
            status: 'falhou',
            tentativas: 1,
            erro: 'SMTP indisponível'
        };

        const queryOrdem = prepararConsultaOrdem(ordemFinalizada());
        const queryRecibo = prepararConsultaRecibo([
            reciboInicial,
            reciboFalhou
        ]);

        db.from.mockImplementation((tabela) => {
            if (tabela === 'ordens_fornecimento') return queryOrdem;
            if (tabela === 'ordens_fornecimento_recibos') return queryRecibo;

            throw new Error(`Tabela inesperada: ${tabela}`);
        });

        const adapter = {
            send: jest.fn().mockRejectedValue(
                new Error('SMTP indisponível')
            )
        };

        const resultado = await enviarReciboFinalizacaoOF({
            ordemId: 'of-1',
            usuarioId: 'operador-1',
            db,
            adapter
        });

        expect(adapter.send).toHaveBeenCalledTimes(1);

        expect(queryRecibo.update).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'falhou',
                erro: 'SMTP indisponível',
                tentativas: 1
            })
        );

        expect(resultado.error.code).toBe('FALHA_ENVIO_RECIBO');
        expect(resultado.data.status).toBe('falhou');
    });

    it('permite reenviar o recibo quando o envio anterior falhou', async () => {
        const reciboInicial = {
            id: 'recibo-1',
            tentativas: 1
        };

        const reciboEnviado = {
            id: 'recibo-1',
            status: 'enviado',
            tentativas: 2
        };

        const queryOrdem = prepararConsultaOrdem(ordemFinalizada());

        const queryRecibo = prepararConsultaRecibo(
            [reciboInicial, reciboEnviado],
            { id: 'recibo-1', status: 'falhou' }
        );

        db.from.mockImplementation((tabela) => {
            if (tabela === 'ordens_fornecimento') return queryOrdem;
            if (tabela === 'ordens_fornecimento_recibos') return queryRecibo;

            throw new Error(`Tabela inesperada: ${tabela}`);
        });

        const adapter = {
            send: jest.fn().mockResolvedValue({
                messageId: 'mensagem-456'
            })
        };

        const resultado = await reenviarReciboFinalizacaoOF({
            ordemId: 'of-1',
            usuarioId: 'gestor-1',
            db,
            adapter
        });

        expect(adapter.send).toHaveBeenCalledTimes(1);
        expect(resultado.error).toBeNull();
        expect(resultado.data.status).toBe('enviado');
    });

    it('bloqueia o reenvio quando o recibo já está sendo enviado', async () => {
        const queryRecibo = prepararConsultaRecibo([], {
            id: 'recibo-1',
            status: 'enviando'
        });

        db.from.mockReturnValue(queryRecibo);

        const adapter = {
            send: jest.fn()
        };

        const resultado = await reenviarReciboFinalizacaoOF({
            ordemId: 'of-1',
            usuarioId: 'gestor-1',
            db,
            adapter
        });

        expect(resultado.error.code).toBe('RECIBO_EM_ENVIO');
        expect(adapter.send).not.toHaveBeenCalled();
    });

    it('bloqueia o reenvio quando o recibo já foi enviado', async () => {
        const queryRecibo = prepararConsultaRecibo([], {
            id: 'recibo-1',
            status: 'enviado'
        });

        db.from.mockReturnValue(queryRecibo);

        const adapter = {
            send: jest.fn()
        };

        const resultado = await reenviarReciboFinalizacaoOF({
            ordemId: 'of-1',
            usuarioId: 'gestor-1',
            db,
            adapter
        });

        expect(resultado.error.code).toBe('RECIBO_NAO_REENVIAVEL');
        expect(adapter.send).not.toHaveBeenCalled();
    });
});
