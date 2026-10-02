import 'dotenv/config'
import app from './src/app.js'
import { iniciarJobDeProximidade } from './src/modules/notificacoes/services/proximidade.job.js'

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`)

    if (process.env.PROXIMIDADE_JOB_ENABLED !== 'false') {
        iniciarJobDeProximidade()
    }
})
