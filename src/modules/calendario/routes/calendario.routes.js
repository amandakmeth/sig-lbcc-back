import express from 'express'
import {
    getFeriados,
    getFeriado,
    createFeriado,
    updateFeriado,
    patchStatusFeriado
} from '../controllers/calendario.controller.js'
import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'

const router = express.Router()

router.use(authMiddleware)
router.get('/', getFeriados)
router.get('/:id', getFeriado)
router.post('/', createFeriado)
router.put('/:id', updateFeriado)
router.patch('/:id/status', patchStatusFeriado)

export default router

