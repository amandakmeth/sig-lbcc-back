import 'dotenv/config'
import {
    ACTIVE_ORDER_STATUSES,
    isEligibleForOverdue
} from '../src/modules/fornecimento/services/atraso.job.js'

describe('job de atraso', () => {
    it('considera somente ordens ativas com data limite valida', () => {
        expect(ACTIVE_ORDER_STATUSES).toEqual(['enviada', 'em_entrega'])
        expect(isEligibleForOverdue({
            status: 'enviada',
            data_previsao_entrega: '2026-10-02'
        })).toBe(true)
        expect(isEligibleForOverdue({
            status: 'finalizada',
            data_previsao_entrega: '2026-10-02'
        })).toBe(false)
        expect(isEligibleForOverdue({
            status: 'em_entrega',
            data_previsao_entrega: null
        })).toBe(false)
    })
})
