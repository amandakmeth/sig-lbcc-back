import 'dotenv/config'
import { jest } from '@jest/globals'

const registrarAuditoria = jest.fn().mockResolvedValue({ data: {}, error: null })

jest.unstable_mockModule('../src/modules/historico_pacientes/services/auditoria.service.js', () => ({
    registrarAuditoria
}))

const { enviarLembreteFornecedor, LEMBRETE_STATUS } = await import(
    '../src/modules/notificacoes/services/lembretes-fornecedor.service.js'
)

function createFakeDb() {
    const state = {
        ordem: {
            id: 'of-1',
            numero: 'OF-2026-0001',
            cotacao_id: 'cot-1',
            fornecedor_id: 'for-1',
            status: 'enviada',
            data_previsao_entrega: '2026-10-05',
            prazo_ciclo: 1,
            fornecedores: {
                id: 'for-1',
                razao_social: 'Fornecedor A LTDA',
                nome_fantasia: 'Fornecedor A',
                email: 'contato@fornecedor.test',
                ativo: true
            },
            cotacoes: { id: 'cot-1', numero: 'COT-2026-0001' }
        },
        lembretes: [{
            id: 'l-1',
            ordem_fornecimento_id: 'of-1',
            prazo_ciclo: 1,
            status: 'pendente',
            tentativas_realizadas: 0,
            proxima_tentativa_em: '2026-10-02T09:00:00.000Z',
            ultima_tentativa_em: null,
            ultimo_destinatario_email: null,
            ultimo_erro: null,
            ultimo_metadado: {},
            created_at: '2026-10-02T08:00:00.000Z',
            updated_at: '2026-10-02T08:00:00.000Z'
        }],
        tentativas: []
    }

    function matches(row, filters) {
        return filters.every((filter) => {
            if (filter.type === 'eq') return row?.[filter.field] === filter.value
            if (filter.type === 'in') return filter.values.includes(row?.[filter.field])
            if (filter.type === 'lte') return new Date(row?.[filter.field]) <= new Date(filter.value)
            return true
        })
    }

    function builder(table) {
        const filters = []
        let action = 'select'
        let payload = null
        let orderField = null
        let orderAscending = true
        let limit = null

        const api = {
            select() { return api },
            eq(field, value) { filters.push({ type: 'eq', field, value }); return api },
            in(field, values) { filters.push({ type: 'in', field, values }); return api },
            lte(field, value) { filters.push({ type: 'lte', field, value }); return api },
            order(field, options = {}) {
                orderField = field
                orderAscending = options.ascending !== false
                return api
            },
            limit(value) { limit = value; return api },
            insert(values) { action = 'insert'; payload = values[0]; return api },
            update(values) { action = 'update'; payload = values; return api },
            async maybeSingle() { return resolve(true) },
            async single() { return resolve(false) }
        }

        function rows() {
            if (table === 'ordens_fornecimento') return [state.ordem]
            if (table === 'lembretes_fornecedor') return state.lembretes
            if (table === 'lembretes_fornecedor_tentativas') return state.tentativas
            return []
        }

        function resolve(isMaybeSingle) {
            if (action === 'insert') {
                const id = `t-${state.tentativas.length + 1}`
                const row = {
                    id,
                    ...payload,
                    created_at: payload.created_at || new Date().toISOString(),
                    finalizado_em: null,
                    erro: null
                }
                state.tentativas.push(row)
                return { data: row, error: null }
            }

            let result = rows().filter((row) => matches(row, filters))
            if (orderField) {
                result.sort((a, b) => {
                    const left = a[orderField]
                    const right = b[orderField]
                    return orderAscending
                        ? (left > right ? 1 : -1)
                        : (left < right ? 1 : -1)
                })
            }
            if (limit !== null) result = result.slice(0, limit)

            if (action === 'update') {
                for (const row of result) Object.assign(row, payload)
            }

            if (isMaybeSingle) return { data: result[0] || null, error: null }
            return { data: result[0] || null, error: result[0] ? null : { message: 'Registro nao encontrado' } }
        }

        return api
    }

    return {
        state,
        from: (table) => builder(table)
    }
}

describe('envio do lembrete ao fornecedor', () => {
    beforeEach(() => registrarAuditoria.mockClear())

    it('registra falha transitória, reenvia com novo contato e não cria notificação interna', async () => {
        const db = createFakeDb()
        const adapter = {
            send: jest.fn()
                .mockRejectedValueOnce(Object.assign(new Error('SMTP ocupado'), { statusCode: 421 }))
                .mockResolvedValueOnce({ provider: 'simulado', messageId: 'msg-2' })
        }

        const primeira = await enviarLembreteFornecedor({
            ordemId: 'of-1',
            ciclo: 1,
            agora: new Date('2026-10-02T09:00:00Z'),
            adapter,
            db
        })

        expect(primeira.status).toBe(LEMBRETE_STATUS.FALHA_RECUPERAVEL)
        expect(db.state.lembretes[0].ultimo_destinatario_email).toBe('contato@fornecedor.test')

        const reenvio = await enviarLembreteFornecedor({
            ordemId: 'of-1',
            ciclo: 1,
            agora: new Date('2026-10-02T09:01:00Z'),
            manual: true,
            usuarioId: 'gestor-1',
            adapter,
            db
        })

        expect(reenvio.status).toBe(LEMBRETE_STATUS.ENVIADO)
        expect(adapter.send).toHaveBeenCalledTimes(2)
        expect(db.state.tentativas).toHaveLength(2)
        expect(db.state.tentativas.map((item) => item.destinatario_email)).toEqual([
            'contato@fornecedor.test',
            'contato@fornecedor.test'
        ])
        expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({
            acao: 'LEMBRETE_FORNECEDOR_REENVIO_MANUAL'
        }))
        expect(registrarAuditoria.mock.calls.some(([event]) => event.acao === 'NOTIFICACAO_INTERNA_CRIADA')).toBe(false)
    })
})
