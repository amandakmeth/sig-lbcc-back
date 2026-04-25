import express from 'express'
import {
    getPacientes,
    getPacienteById,
    createPaciente,
    updatePaciente,
    deletePaciente
} from '../controller/pacientes.controller.js'

import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'

const router = express.Router()

router.use(authMiddleware)

router.get('/', getPacientes)
router.get('/:id', getPacienteById)
router.post('/', createPaciente)
router.put('/:id', updatePaciente)
router.delete('/:id', deletePaciente)

export default router
