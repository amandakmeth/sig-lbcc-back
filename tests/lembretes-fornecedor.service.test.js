import 'dotenv/config'
import {
    buildReminderEmail,
    calcularDataDaTentativa,
    classificarFalhaDeEmail,
    isValidSupplierEmail,
    LEMBRETE_TENTATIVA_DELAYS_MS,
    MAX_TENTATIVAS_LEMBRETE,
    statusFinalDeFalha,
    LEMBRETE_STATUS
} from '../src/modules/notificacoes/services/lembretes-fornecedor.service.js'

describe('lembretes ao fornecedor', () => {
    it('agenda exatamente tres tentativas em intervalos progressivos', () => {
        const criadaEm = new Date('2026-10-02T10:00:00Z')

        expect(MAX_TENTATIVAS_LEMBRETE).toBe(3)
        expect(LEMBRETE_TENTATIVA_DELAYS_MS).toEqual([
            5 * 60 * 1000,
            30 * 60 * 1000,
            2 * 60 * 60 * 1000
        ])
        expect(calcularDataDaTentativa({ criadaEm, numeroTentativa: 1 })).toEqual(
            new Date('2026-10-02T10:05:00Z')
        )
        expect(calcularDataDaTentativa({ criadaEm, numeroTentativa: 3 })).toEqual(
            new Date('2026-10-02T12:00:00Z')
        )
        expect(calcularDataDaTentativa({ criadaEm, numeroTentativa: 4 })).toBeNull()
    })

    it('classifica falhas transitorias e definitivas sem esconder a possibilidade de reenvio', () => {
        expect(classificarFalhaDeEmail({ statusCode: 421 })).toMatchObject({ recuperavel: true })
        expect(classificarFalhaDeEmail({ statusCode: 550 })).toMatchObject({ recuperavel: false })
        expect(statusFinalDeFalha({ recuperavel: true, numeroTentativa: 1 })).toBe(
            LEMBRETE_STATUS.FALHA_RECUPERAVEL
        )
        expect(statusFinalDeFalha({ recuperavel: true, numeroTentativa: 3 })).toBe(
            LEMBRETE_STATUS.FALHA_DEFINITIVA
        )
        expect(statusFinalDeFalha({ recuperavel: false, numeroTentativa: 1 })).toBe(
            LEMBRETE_STATUS.FALHA_DEFINITIVA
        )
    })

    it('monta e-mail sem dados do paciente e valida o contato a cada envio', () => {
        const email = buildReminderEmail({
            ordem: {
                id: 'of-1',
                numero: 'OF-2026-0001',
                cotacao_id: 'cot-1',
                fornecedor_id: 'for-1',
                data_previsao_entrega: '2026-10-05',
                fornecedores: {
                    nome_fantasia: 'Fornecedor A',
                    email: 'contato@fornecedor.test'
                },
                cotacoes: { numero: 'COT-2026-0001' },
                pacientes: { nome: 'Paciente Sigiloso' }
            },
            link: 'https://app.test/fornecimento/of-1'
        })

        expect(email.subject).toContain('OF-2026-0001')
        expect(email.text).toContain('Fornecedor A')
        expect(email.text).toContain('COT-2026-0001')
        expect(email.text).toContain('2026-10-05')
        expect(email.text).toContain('https://app.test/fornecimento/of-1')
        expect(email.text).not.toContain('Paciente Sigiloso')
        expect(isValidSupplierEmail('contato@fornecedor.test')).toBe(true)
        expect(isValidSupplierEmail('sem-email')).toBe(false)
    })
})
