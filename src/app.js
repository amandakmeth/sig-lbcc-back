import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import usuariosRoutes from './routes/usuarios.routes.js'

dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())

app.use('/usuarios', usuariosRoutes)

export default app