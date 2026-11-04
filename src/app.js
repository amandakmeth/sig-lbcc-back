import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import routes from './routes/index.js'
import swaggerUi from 'swagger-ui-express'
import swaggerSpec from './config/swagger.js'

const app = express()

app.use(cors())
app.use(express.json())
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

app.get('/', (req, res) => {
    res.send('API rodando 🚀')
})

app.use(routes)

app.use((err, req, res, next) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ erro: 'Cada evidência deve ter no máximo 5 MB.', codigo: 'ARQUIVO_MUITO_GRANDE' })
    }
    if (err?.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ erro: 'Anexe no máximo cinco evidências por registro.', codigo: 'EVIDENCIAS_LIMITE' })
    }
    console.error(err.stack)
    res.status(500).json({ erro: 'Erro interno do servidor' })
})

export default app

