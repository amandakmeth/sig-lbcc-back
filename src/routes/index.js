import express from 'express'
import usuariosRoutes from '../modules/usuarios/routes/usuarios.routes.js'
import authRoutes from '../modules/auth/routes/auth.routes.js'
import { authMiddleware } from '../modules/auth/middlewares/auth.middleware.js'
import {getUsuarios} from '../modules/usuarios/controllers/usuarios.controller.js'

const router = express.Router()

router.use('/usuarios', usuariosRoutes)
router.use('/auth', authRoutes)
router.get('/', authMiddleware, getUsuarios)

export default router