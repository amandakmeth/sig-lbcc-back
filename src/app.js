import express from 'express'
import cors from 'cors'
import routes from './routes/index.js'

const app = express()

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
    res.send('API rodando 🚀')
})

app.use(routes)

app.use((err, req, res, next) => {
    console.error(err.stack)
    res.status(500).json({ erro: 'Erro interno do servidor' })
})

export default app

