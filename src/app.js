import express from 'express'
import cors from 'cors'
import usuariosRoutes from './modules/usuarios/routes/usuarios.routes.js'


const app = express()

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
    res.send('API rodando 🚀')
})
app.use('/usuarios', usuariosRoutes)

export default app