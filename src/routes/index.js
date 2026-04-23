import express from 'express'
import usuariosRoutes from '../modules/usuarios/routes/usuarios.routes.js'

const router = express.Router()

router.use('/usuarios', usuariosRoutes)

export default router