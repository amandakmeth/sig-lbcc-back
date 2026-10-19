
import { jest } from '@jest/globals'

function createBuilder(result) {
    const builder = {
        inserted: null,
        updated: null,
        insert: jest.fn((payload) => {
            builder.inserted = payload
            return builder
        }),
        update: jest.fn((payload) => {
            builder.updated = payload
            return builder
        }),
        select: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        in: jest.fn(() => builder),
        lte: jest.fn(() => builder),
        order: jest.fn(() => builder),
        limit: jest.fn(() => builder),
        single: jest.fn(async () => result),
        maybeSingle: jest.fn(async () => result),
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
    }

    return builder
}

const envioPendente = {
    id: 'envio-1',
    ordem_fornecimento_id: 'of-1',
    ciclo: 1,
    tentativa: 1,
    tipo: 'automatico',
    status: 'pendente',
    metadados: {},
    agendado_em: '2000-01-01T00:00:00.000Z'
}

const ordem = {
    id: 'of-1',
    numero: 'OF-2026-0001',
    cotacao_id: 'cotacao-1',
    fornecedor_id: 'fornecedor-1',
    status: 'rascunho',
    status_envio: 'pendente',
    data_emissao: '2026-10-09',
    data_envio: null,
    data_previsao_entrega: null,
    valor_total: 100,
    observacoes: null,
    fornecedores: {
        id: 'fornecedor-1',
        nome: 'Fornecedor Teste',
        email: 'fornecedor@example.com'
    },
    ordem_fornecimento_itens: []
}

let builders
let ordemUpdateBuilders
let envioInsertBuilder

function configurarMocks({ sucesso = false } = {}) {
    const envioBusca = createBuilder({
        data: envioPendente,
        error: null
    })

    const envioClaim = createBuilder({
        data: envioPendente,
        error: null
    })

    const envioPdfUpdate = createBuilder({
        data: null,
        error: null
    })

    const envioSucessoUpdate = createBuilder({
        data: {
            ...envioPendente,
            status: 'enviado',
            enviado_em: '2026-10-09T12:00:00.000Z'
        },
        error: null
    })

    const envioFalhaUpdate = createBuilder({
        data: null,
        error: null
    })

    envioInsertBuilder = createBuilder({
        data: {
            ...envioPendente,
            id: 'envio-2',
            tentativa: 2,
            status: 'pendente',
            agendado_em: '2026-10-09T12:01:00.000Z'
        },
        error: null
    })

    const ordemBusca = createBuilder({
        data: ordem,
        error: null
    })

    const ordemUpdateEnviando = createBuilder({
        data: null,
        error: null
    })

    const ordemUpdateFalha = createBuilder({
        data: null,
        error: null
    })

    const ordemUpdateSucesso = createBuilder({
        data: {
            id: 'of-1',
            status: 'enviada',
            status_envio: 'enviado',
            data_envio: '2026-10-09T12:00:00.000Z',
            data_previsao_entrega: '2026-10-20',
            status_prazo: 'normal'
        },
        error: null
    })

    ordemUpdateBuilders = sucesso
        ? [ordemUpdateEnviando, ordemUpdateSucesso]
        : [ordemUpdateEnviando, ordemUpdateFalha]

    builders = {
        ordens_fornecimento_envios: sucesso
            ? [
                envioBusca,
                envioClaim,
                envioPdfUpdate,
                envioSucessoUpdate
            ]
            : [
                envioBusca,
                envioClaim,
                envioPdfUpdate,
                envioFalhaUpdate,
                envioInsertBuilder
            ],
        ordens_fornecimento: [
            ordemBusca,
            ...ordemUpdateBuilders
        ]
    }
}

const db = {
    from: jest.fn((table) => {
        const builder = builders[table]?.shift()

        if (!builder) {
            throw new Error(`Mock não configurado para a tabela: ${table}`)
        }

        return builder
    })
}

jest.unstable_mockModule('../src/config/supabaseAdmin.js', () => ({
    default: db
}))

jest.unstable_mockModule(
    '../src/modules/historico_pacientes/services/auditoria.service.js',
    () => ({
        registrarAuditoria: jest.fn()
    })
)

jest.unstable_mockModule(
    '../src/modules/notificacoes/services/smtp.adapter.js',
    () => ({
        createSmtpAdapter: jest.fn()
    })
)

jest.unstable_mockModule(
    '../src/modules/calendario/services/calendario.service.js',
    () => ({
        listarDatasFeriadosAtivos: jest.fn(async () => ({
            data: [],
            error: null
        }))
    })
)

jest.unstable_mockModule(
    '../src/modules/fornecimento/services/ordem-fornecimento-pdf.service.js',
    () => ({
        buildOrderPdf: jest.fn(() => Buffer.from('PDF de teste')),
        nomeArquivoPdf: jest.fn(() => 'OF-2026-0001.pdf')
    })
)

const {
    processarEnvioOrdemDeFornecimento
} = await import(
    '../src/modules/fornecimento/services/ordem-fornecimento-email.service.js'
)

describe('processamento do envio da Ordem de Fornecimento', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        configurarMocks()
    })

    it('agenda nova tentativa e não define o prazo quando o e-mail falha', async () => {
        const erroSmtp = new Error('SMTP temporariamente indisponível')
        erroSmtp.retryable = true

        const adapter = {
            send: jest.fn().mockRejectedValue(erroSmtp)
        }

        const resultado = await processarEnvioOrdemDeFornecimento({
            ordemId: 'of-1',
            agora: new Date('2026-10-09T12:00:00.000Z'),
            adapter,
            db,
            logger: { error: jest.fn() }
        })

        expect(adapter.send).toHaveBeenCalledTimes(1)
        expect(resultado.error).toBeDefined()
        expect(resultado.retryScheduled).toBe(true)

        expect(envioInsertBuilder.inserted[0]).toEqual(
            expect.objectContaining({
                ordem_fornecimento_id: 'of-1',
                ciclo: 1,
                tentativa: 2,
                tipo: 'automatico',
                status: 'pendente'
            })
        )

        expect(ordemUpdateBuilders[1].updated).toEqual(
            expect.objectContaining({
                status_envio: 'falhou_retentando'
            })
        )

        for (const builder of ordemUpdateBuilders) {
            expect(builder.updated).not.toHaveProperty(
                'data_previsao_entrega'
            )
        }

        expect(ordem.data_previsao_entrega).toBeNull()
    })

    it('define o prazo de 7 dias úteis somente após o envio bem-sucedido', async () => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2026-10-09T12:00:00.000Z'))

        try {
            configurarMocks({ sucesso: true })

            const adapter = {
                send: jest.fn().mockResolvedValue({
                    messageId: 'email-123',
                    provider: 'smtp'
                })
            }

            const resultado = await processarEnvioOrdemDeFornecimento({
                ordemId: 'of-1',
                agora: new Date('2026-10-09T12:00:00.000Z'),
                adapter,
                db,
                logger: { error: jest.fn() }
            })

            expect(resultado.error).toBeNull()
            expect(adapter.send).toHaveBeenCalledTimes(1)

            expect(ordemUpdateBuilders[1].updated).toEqual(
                expect.objectContaining({
                    status: 'enviada',
                    status_envio: 'enviado',
                    data_previsao_entrega: '2026-10-20',
                    status_prazo: 'normal'
                })
            )
        } finally {
            jest.useRealTimers()
        }
    })
})
