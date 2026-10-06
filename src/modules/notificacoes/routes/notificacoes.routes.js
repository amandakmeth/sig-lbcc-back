import express from 'express'
import {
    listar,
    marcarComoLida,
    arquivar
} from '../controllers/notificacoes.controller.js'
import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'

const router = express.Router()

router.use(authMiddleware)

router.get('/', listar)
router.patch('/:id/lida', marcarComoLida)
router.patch('/:id/arquivar', arquivar)

export default router
