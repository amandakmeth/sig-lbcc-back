import { processarEnviosPendentes } from '../src/modules/fornecimento/services/ordem-fornecimento-email.service.js'

const erro = {
    code: 'PGRST205',
    details: null,
    hint: "Perhaps you meant the table 'public.ordens_fornecimento'",
    message: "Could not find the table 'public.ordens_fornecimento_envios' in the schema cache"
}

const db = {
    from(table) {
        if (table !== 'ordens_fornecimento_envios') {
            throw new Error(`tabela inesperada: ${table}`)
        }

        const query = {
            select() { return query },
            eq() { return query },
            lte() { return query },
            order() { return query },
            limit() { return query },
            then(resolve, reject) {
                return Promise.resolve({ data: null, error: erro }).then(resolve, reject)
            }
        }

        return query
    }
}

try {
    await processarEnviosPendentes({
        db,
        agora: new Date('2026-10-06T12:00:00.000Z')
    })
    console.error('REPRO VERDE: era esperado PGRST205')
    process.exitCode = 1
} catch (error) {
    const reproduziu = error?.code === erro.code && error?.message === erro.message
    console.log(JSON.stringify({
        repro: reproduziu ? 'RED' : 'UNEXPECTED',
        code: error?.code,
        message: error?.message
    }))
    if (!reproduziu) process.exitCode = 1
}
