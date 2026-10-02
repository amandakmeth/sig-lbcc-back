import {
    calculateDeadlineStatus,
    countBusinessDaysInclusive,
    getBrasiliaDate,
    isBusinessDay,
    STATUS_PRAZO
} from '../src/modules/fornecimento/services/prazo.utils.js'

describe('calendario institucional e prazo', () => {
    it('considera sabado e domingo dias nao uteis', () => {
        expect(isBusinessDay('2026-10-03')).toBe(false)
        expect(isBusinessDay('2026-10-04')).toBe(false)
        expect(isBusinessDay('2026-10-05')).toBe(true)
    })

    it('desconsidera feriados cadastrados', () => {
        expect(isBusinessDay('2026-10-12', ['2026-10-12'])).toBe(false)
        expect(countBusinessDaysInclusive('2026-10-09', '2026-10-13', ['2026-10-12'])).toBe(2)
    })

    it('marca como proximo quando ha ate tres dias uteis inclusivos', () => {
        expect(calculateDeadlineStatus({
            today: '2026-10-01',
            deadline: '2026-10-05'
        })).toBe(STATUS_PRAZO.PROXIMA_EXPIRACAO)
    })

    it('mantem normal quando o prazo esta distante e marca atraso depois do limite', () => {
        expect(calculateDeadlineStatus({
            today: '2026-10-01',
            deadline: '2026-10-20'
        })).toBe(STATUS_PRAZO.NORMAL)
        expect(calculateDeadlineStatus({
            today: '2026-10-21',
            deadline: '2026-10-20'
        })).toBe(STATUS_PRAZO.ATRASADA)
    })

    it('obtém a data no fuso de Brasilia', () => {
        expect(getBrasiliaDate(new Date('2026-10-02T02:00:00.000Z'))).toBe('2026-10-01')
    })
})
