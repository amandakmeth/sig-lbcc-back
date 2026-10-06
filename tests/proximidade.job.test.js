import 'dotenv/config'
import {
    ACTIVE_ORDER_STATUSES,
    buildProximityNotification,
    isEligibleOrder
} from '../src/modules/notificacoes/services/proximidade.job.js'
import { montarChaveDeNotificacao } from '../src/modules/notificacoes/services/notificacoes.service.js'

describe('job de proximidade', () => {
    it('considera somente ordens ativas com data limite valida', () => {
        expect(ACTIVE_ORDER_STATUSES).toEqual(['enviada', 'em_entrega'])
        expect(isEligibleOrder({ status: 'enviada', data_previsao_entrega: '2026-10-05' })).toBe(true)
        expect(isEligibleOrder({ status: 'em_entrega', data_previsao_entrega: '2026-10-05' })).toBe(true)
        expect(isEligibleOrder({ status: 'finalizada', data_previsao_entrega: '2026-10-05' })).toBe(false)
        expect(isEligibleOrder({ status: 'enviada', data_previsao_entrega: 'data-invalida' })).toBe(false)
    })

    it('monta snapshot completo e chave por ordem, ciclo e destinatario', () => {
        const notification = buildProximityNotification({
            ordem: {
                id: 'of-1',
                numero: 'OF-2026-0001',
                cotacao_id: 'cot-1',
                fornecedor_id: 'for-1',
                paciente_id: 'pac-1',
                data_previsao_entrega: '2026-10-05',
                prazo_ciclo: 3,
                fornecedores: { nome_fantasia: 'Fornecedor A' },
                pacientes: { nome: 'Paciente A' },
                cotacoes: { numero: 'COT-2026-0001' }
            },
            destinatarioId: 'gestor-1'
        })

        expect(notification.dados).toMatchObject({
            ordem: { id: 'of-1', numero: 'OF-2026-0001' },
            paciente: { id: 'pac-1', nome: 'Paciente A' },
            fornecedor: { id: 'for-1', nome: 'Fornecedor A' },
            cotacao: { id: 'cot-1', numero: 'COT-2026-0001' },
            data_limite: '2026-10-05',
            status_prazo: 'proxima_expiracao',
            link: '/fornecimento/of-1'
        })
        expect(notification.idempotencyKey).toBe(
            montarChaveDeNotificacao({ ordemId: 'of-1', ciclo: 3, destinatarioId: 'gestor-1' })
        )
    })
})
