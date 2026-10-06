import { jest } from '@jest/globals'

const cotacao = {
    id: 'cotacao-1',
    status: 'finalizada',
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

const ordensExistentesBuilder = createBuilder({ data: [], error: null })
const numeroBuilder = createBuilder({ data: null, error: null })
const ordemInsertBuilder = createBuilder({
    data: {
        id: 'ordem-1',
        numero: 'OF-2026-0001',
        status: 'rascunho',
        data_previsao_entrega: '2026-10-21',
        prazo_ciclo: 1,
        status_prazo: 'normal'
    },
    error: null
})

const builders = {
    cotacoes: [createBuilder({ data: cotacao, error: null })],
    cotacao_proposta_itens: [createBuilder({ data: vencedores, error: null })],
    ordens_fornecimento: [
        ordensExistentesBuilder,
        numeroBuilder,
        ordemInsertBuilder
    ],
    ordem_fornecimento_itens: [createBuilder({
        data: [{ id: 'ordem-item-1' }],
        error: null
    })]
}

const db = {
    from: jest.fn((table) => builders[table].shift())
}

jest.unstable_mockModule('../src/config/supabase.js', () => ({ default: db }))
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

    it('inicia a ordem com 7 dias úteis, ignorando fins de semana e feriados ativos', async () => {
        const resultado = await gerarOrdensDeFornecimento({
            cotacaoId: 'cotacao-1',
            criadoPor: 'usuario-1'
        })

        expect(resultado.error).toBeNull()
        expect(ordemInsertBuilder.inserted[0]).toEqual(expect.objectContaining({
            data_previsao_entrega: '2026-10-21',
            status_prazo: 'normal'
        }))
        expect(resultado.data[0].data_previsao_entrega).toBe('2026-10-21')
    })
})
