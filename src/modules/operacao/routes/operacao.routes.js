import express from 'express'
import {
    consultarExecucoes,
    consultarExecucao,
    consultarPendencias,
    processarPrazosManualmente
} from '../controllers/operacao.controller.js'
import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'

const router = express.Router()

router.use(authMiddleware)

router.post('/automacao/prazos/processar', processarPrazosManualmente)
router.get('/automacao/execucoes', consultarExecucoes)
router.get('/automacao/execucoes/:id', consultarExecucao)
router.get('/automacao/pendencias', consultarPendencias)

export default router
