export const STATUS_PRAZO = Object.freeze({
    NORMAL: 'normal',
    PROXIMA_EXPIRACAO: 'proxima_expiracao',
    ATRASADA: 'atrasada'
})

export const BRASILIA_TIME_ZONE = 'America/Sao_Paulo'

function pad(value) {
    return String(value).padStart(2, '0')
}

export function toDateOnly(value) {
    if (!value) return null

    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!match) return null

    const [, year, month, day] = match
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))

    if (
        date.getUTCFullYear() !== Number(year)
        || date.getUTCMonth() !== Number(month) - 1
        || date.getUTCDate() !== Number(day)
    ) {
        return null
    }

    return `${year}-${month}-${day}`
}

export function getBrasiliaDate(now = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: BRASILIA_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    })

    const parts = formatter.formatToParts(now).reduce((result, part) => {
        if (part.type !== 'literal') result[part.type] = part.value
        return result
    }, {})

    return `${parts.year}-${parts.month}-${parts.day}`
}

function parseDateOnly(value) {
    const normalized = toDateOnly(value)
    if (!normalized) return null

    const [year, month, day] = normalized.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day))
}

function addDays(value, amount) {
    const date = parseDateOnly(value)
    if (!date) return null

    date.setUTCDate(date.getUTCDate() + amount)
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function getWeekday(value) {
    return parseDateOnly(value)?.getUTCDay()
}

export function parseBusinessDayCount(value) {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value > 0 ? value : null
    }

    const match = String(value || '').match(/\d+/)
    if (!match) return null

    const days = Number(match[0])
    return Number.isSafeInteger(days) && days > 0 ? days : null
}

export function normalizeHolidayDates(holidays = []) {
    const values = holidays instanceof Set ? Array.from(holidays) : holidays

    return new Set(
        values
            .map((holiday) => {
                if (typeof holiday === 'string') return toDateOnly(holiday)
                return toDateOnly(holiday?.data || holiday?.date)
            })
            .filter(Boolean)
    )
}

export function isBusinessDay(value, holidays = []) {
    const date = toDateOnly(value)
    if (!date) return false

    const weekday = getWeekday(date)
    if (weekday === 0 || weekday === 6) return false

    return !normalizeHolidayDates(holidays).has(date)
}

export function getNextBusinessDayAfter(value, holidays = []) {
    let cursor = addDays(value, 1)

    while (cursor && !isBusinessDay(cursor, holidays)) {
        cursor = addDays(cursor, 1)
    }

    return cursor
}

export function addBusinessDays(value, amount, holidays = []) {
    const startDate = toDateOnly(value)
    const days = Number(amount)

    if (!startDate || !Number.isSafeInteger(days) || days < 0) return null

    let cursor = startDate
    let remaining = days

    while (remaining > 0) {
        cursor = addDays(cursor, 1)
        if (isBusinessDay(cursor, holidays)) remaining -= 1
    }

    return cursor
}

export function isDeadlineOverdue({ deadline, today, holidays = [] }) {
    const deadlineDate = toDateOnly(deadline)
    const todayDate = toDateOnly(today) || getBrasiliaDate()
    if (!deadlineDate || !todayDate) return false

    const firstOverdueDate = getNextBusinessDayAfter(deadlineDate, holidays)
    return Boolean(firstOverdueDate && todayDate >= firstOverdueDate)
}

export function countBusinessDaysInclusive(start, end, holidays = []) {
    const startDate = toDateOnly(start)
    const endDate = toDateOnly(end)
    if (!startDate || !endDate || startDate > endDate) return 0

    const holidayDates = normalizeHolidayDates(holidays)
    let cursor = startDate
    let total = 0

    while (cursor <= endDate) {
        if (isBusinessDay(cursor, holidayDates)) total += 1
        cursor = addDays(cursor, 1)
    }

    return total
}

export function calculateDeadlineStatus({ deadline, today, holidays = [] }) {
    const deadlineDate = toDateOnly(deadline)
    const todayDate = toDateOnly(today) || getBrasiliaDate()

    if (!deadlineDate) return STATUS_PRAZO.NORMAL
    if (deadlineDate < todayDate) {
        return isDeadlineOverdue({
            deadline: deadlineDate,
            today: todayDate,
            holidays
        })
            ? STATUS_PRAZO.ATRASADA
            : STATUS_PRAZO.PROXIMA_EXPIRACAO
    }

    const daysRemaining = countBusinessDaysInclusive(
        todayDate,
        deadlineDate,
        holidays
    )

    return daysRemaining <= 3
        ? STATUS_PRAZO.PROXIMA_EXPIRACAO
        : STATUS_PRAZO.NORMAL
}

