import supabaseAdmin from '../src/config/supabaseAdmin.js'

for (const table of ['ordens_fornecimento', 'ordens_fornecimento_envios']) {
    const result = await supabaseAdmin.from(table).select('id').limit(1)
    console.log(JSON.stringify({
        table,
        ok: !result.error,
        error: result.error
            ? {
                code: result.error.code,
                message: result.error.message,
                hint: result.error.hint
            }
            : null
    }))
}
