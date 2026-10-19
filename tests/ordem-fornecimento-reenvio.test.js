
import { jest } from '@jest/globals'

const ordem = {
    id: 'of-1',
    numero: 'OF-2026-0001',
    status: 'rascunho',
    status_envio: 'falhou_retentando'
}

const envioAnterior = {
    id: 'envio-1',
    ordem_fornecimento_id: 'of-1',
    ciclo: 1,
    tentativa: 2,
    status: 'falhou'
}

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
        order: jest.fn(() => builder),
        limit: jest.fn(() => builder),
        single: jest.fn(async () => result),
        maybeSingle: jest.fn(async () => result),
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
    }

    return builder
}

let builders
let envioInsertBuilder
let ordemUpdateBuilder

function configurarMocks({
    envioAtivo = { data: null, error: null },
    ultimoEnvio = { data: envioAnterior, error: null },
    envioInserido = {
        data: {
            id: 'envio-2',
            ordem_fornecimento_id: 'of-1',
            ciclo: 2,
            tentativa: 1,
            tipo: 'manual',
            status: 'pendente'
        },
        error: null
    }
} = {}) {
    const ordemBuscaBuilder = createBuilder({
        data: ordem,
        error: null
    })

    const envioAtivoBuilder = createBuilder(envioAtivo)
    const ultimoEnvioBuilder = createBuilder(ultimoEnvio)

    envioInsertBuilder = createBuilder(envioInserido)
    ordemUpdateBuilder = createBuilder({ data: null, error: null })

    builders = {
        ordens_fornecimento: [
            ordemBuscaBuilder,
            ordemUpdateBuilder
        ],
        ordens_fornecimento_envios: [
            envioAtivoBuilder,
            ultimoEnvioBuilder,
            envioInsertBuilder
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

jest.unstable_mockModule(
    '../src/config/supabaseAdmin.js',
    () => ({ default: db })
)

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
        listarDatasFeriadosAtivos: jest.fn()
    })
)

const {
    solicitarReenvioOrdemDeFornecimento
} = await import(
    '../src/modules/fornecimento/services/ordem-fornecimento-email.service.js'
)

describe('reenvio manual da Ordem de Fornecimento', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        configurarMocks()
    })

    it('cria um novo ciclo de envio associado à mesma OF', async () => {
        const resultado = await solicitarReenvioOrdemDeFornecimento({
            ordemId: 'of-1',
            usuarioId: 'usuario-1',
            agora: new Date('2026-10-09T12:00:00.000Z'),
            db
        })

        expect(resultado.error).toBeNull()
        expect(resultado.data).toEqual(
            expect.objectContaining({
                ordem_fornecimento_id: 'of-1',
                ciclo: 2,
                tentativa: 1,
                tipo: 'manual',
                status: 'pendente'
            })
        )

        expect(envioInsertBuilder.inserted[0]).toEqual(
            expect.objectContaining({
                ordem_fornecimento_id: 'of-1',
                ciclo: 2,
                tentativa: 1,
                tipo: 'manual',
                status: 'pendente',
                metadados: { usuario_id: 'usuario-1' }
            })
        )

        expect(ordemUpdateBuilder.updated).toEqual(
            expect.objectContaining({
                status_envio: 'pendente',
                email_envio_proxima_tentativa:
                    '2026-10-09T12:00:00.000Z'
            })
        )
    })

    it('impede novo reenvio quando já existe um envio pendente', async () => {
        configurarMocks({
            envioAtivo: {
                data: { id: 'envio-pendente' },
                error: null
            }
        })

        const resultado = await solicitarReenvioOrdemDeFornecimento({
            ordemId: 'of-1',
            usuarioId: 'usuario-1',
            db
        })

        expect(resultado.error).toEqual(
            expect.objectContaining({
                code: 'ENVIO_EM_ANDAMENTO'
            })
        )

        expect(envioInsertBuilder.insert).not.toHaveBeenCalled()
    })
})
