import 'dotenv/config'
import app from './src/app.js'
import { iniciarJobDeProximidade } from './src/modules/notificacoes/services/proximidade.job.js'
import { iniciarJobDeLembretesFornecedor } from './src/modules/notificacoes/services/lembretes-fornecedor.service.js'
import { iniciarJobDeAtraso } from './src/modules/fornecimento/services/atraso.job.js'
import { iniciarJobDeEnvioOrdens } from './src/modules/fornecimento/services/ordem-fornecimento-email.service.js'

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`)

    if (process.env.PROXIMIDADE_JOB_ENABLED !== 'false') {
        iniciarJobDeProximidade()
    }

    if (process.env.ATRASO_JOB_ENABLED !== 'false') {
        iniciarJobDeAtraso()
    }

    if (process.env.LEMBRETES_FORNECEDOR_JOB_ENABLED !== 'false') {
        iniciarJobDeLembretesFornecedor()
    }

    if (process.env.ORDENS_FORNECIMENTO_EMAIL_JOB_ENABLED !== 'false') {
        iniciarJobDeEnvioOrdens()
    }
})
