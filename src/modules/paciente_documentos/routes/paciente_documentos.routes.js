import express from 'express'
import {
    getDocumentosPorPaciente,
    createDocumento,
    deleteDocumento,
    getDocumentoById
} from '../controllers/paciente_documentos.controller.js'

import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'
import upload from '../../../middlewares/upload.middleware.js'

const router = express.Router()

router.use(authMiddleware)

//listar por paciente
router.get('/pacientes/:id/documentos', getDocumentosPorPaciente)

//buscar por id
router.get('/documentos/:id', getDocumentoById)

//criar com upload
router.post(
    '/pacientes/:id/documentos',
    upload.single('file'),
    createDocumento
)

//deletar
router.delete('/documentos/:id', deleteDocumento)

export default router