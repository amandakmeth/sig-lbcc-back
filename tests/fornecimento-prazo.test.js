import { jest } from '@jest/globals'


const cotacaoBase = {
    id: 'cotacao-1',
    status: 'finalizada',
    ativo: true,
    data_validade: '2026-10-30',
    paciente_id: 'paciente-1'
}

const vencedores = [{
    id: 'linha-1',
    item_id: 'item-1',
    proposta_id: 'proposta-1',
    valor_unitario: 10,
    valor_total: 20,
    cotacao_propostas: {
        id: 'proposta-1',
        cotacao_id: 'cotacao-1',
        fornecedor_id: 'fornecedor-1',
        prazo_entrega: '3 dias úteis'
    },
    cotacao_itens: {
        id: 'item-1',
        cotacao_id: 'cotacao-1',
        produto_id: 'produto-1',
        descricao: 'Produto teste',
        quantidade: 2,
        unidade: 'un'
    }
}]

function createBuilder(result) {
    const builder = {
        inserted: null,
        insert: jest.fn((payload) => {
            builder.inserted = payload
            return builder
        }),
        select: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        like: jest.fn(() => builder),
        order: jest.fn(() => builder),
        limit: jest.fn(() => builder),
        single: jest.fn(async () => result),
        maybeSingle: jest.fn(async () => result),
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
    }

    return builder
}

let builders
let ordemInsertBuilder

function configurarBuilders(cotacaoResultado = {
    data: cotacaoBase,
    error: null
}) {
    const ordensExistentesBuilder = createBuilder({
        data: [],
        error: null
    })

    const numeroBuilder = createBuilder({
        data: null,
        error: null
    })

    ordemInsertBuilder = createBuilder({
        data: {
            id: 'ordem-1',
            numero: 'OF-2026-0001',
            status: 'rascunho',
            data_previsao_entrega: null,
            prazo_ciclo: 1,
            status_prazo: 'normal'
        },
        error: null
    })

    builders = {
        cotacoes: [createBuilder(cotacaoResultado)],
        cotacao_proposta_itens: [
            createBuilder({
                data: vencedores,
                error: null
            })
        ],
        ordens_fornecimento: [
            ordensExistentesBuilder,
            numeroBuilder,
            ordemInsertBuilder
        ],
        ordem_fornecimento_itens: [
            createBuilder({
                data: [{ id: 'ordem-item-1' }],
                error: null
            })
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


jest.unstable_mockModule('../src/config/supabase.js', () => ({
    default: db
}))

jest.unstable_mockModule('../src/config/supabaseAdmin.js', () => ({
    default: {
        rpc: jest.fn()
    }
}))
jest.unstable_mockModule('../src/modules/calendario/services/calendario.service.js', () => ({
    listarDatasFeriadosAtivos: jest.fn(async () => ({
        data: [{ data: '2026-10-12' }],
        error: null
    }))
}))
jest.unstable_mockModule('../src/modules/historico_pacientes/services/auditoria.service.js', () => ({
    registrarAuditoria: jest.fn(),
    registrarOcorrencia: jest.fn()
}))

const { gerarOrdensDeFornecimento } = await import(
    '../src/modules/fornecimento/services/fornecimento.services.js'
)

describe('geração da ordem de fornecimento', () => {
    beforeAll(() => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2026-10-09T15:00:00-03:00'))
    })

    afterAll(() => {
        jest.useRealTimers()
    })

    it('cria a ordem sem prazo definido antes do envio bem-sucedido do e-mail', async () => {
        const resultado = await gerarOrdensDeFornecimento({
            cotacaoId: 'cotacao-1',
            criadoPor: 'usuario-1'
        })

        expect(resultado.error).toBeNull()
        expect(ordemInsertBuilder.inserted[0]).toEqual(expect.objectContaining({
            data_previsao_entrega: null,
            status_prazo: 'normal'
        }))
        expect(resultado.data[0].data_previsao_entrega).toBeNull()
    })

    beforeEach(() => {
    configurarBuilders()
    })


it('recusa gerar OF para cotação inativa', async () => {
    configurarBuilders({
        data: {
            ...cotacaoBase,
            ativo: false
        },
        error: null
    })

    const resultado = await gerarOrdensDeFornecimento({
        cotacaoId: 'cotacao-1',
        criadoPor: 'usuario-1'
    })

    expect(resultado.error.message).toMatch(/inativa/i)
    expect(ordemInsertBuilder.insert).not.toHaveBeenCalled()
})

it('recusa gerar OF para cotação vencida', async () => {
    configurarBuilders({
        data: {
            ...cotacaoBase,
            data_validade: '2026-10-08'
        },
        error: null
    })

    const resultado = await gerarOrdensDeFornecimento({
        cotacaoId: 'cotacao-1',
        criadoPor: 'usuario-1'
    })

    expect(resultado.error.message).toMatch(/vencida/i)
    expect(ordemInsertBuilder.insert).not.toHaveBeenCalled()
})

it('recusa gerar OF sem paciente associado', async () => {
    configurarBuilders({
        data: {
            ...cotacaoBase,
            paciente_id: null
        },
        error: null
    })

    const resultado = await gerarOrdensDeFornecimento({
        cotacaoId: 'cotacao-1',
        criadoPor: 'usuario-1'
    })

    expect(resultado.error.message).toMatch(/paciente/i)
    expect(ordemInsertBuilder.insert).not.toHaveBeenCalled()
})

})
