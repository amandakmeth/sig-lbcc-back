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

/**
 * @swagger
 * /pacientes/{id}/documentos:
 *   get:
 *     summary: Listar documentos de um paciente
 *     tags: [Documentos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do paciente
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de documentos
 */
router.get('/pacientes/:id/documentos', getDocumentosPorPaciente)

/**
 * @swagger
 * /documentos/{id}:
 *   get:
 *     summary: Buscar documento por ID
 *     tags: [Documentos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do documento
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Documento encontrado
 *       404:
 *         description: Documento não encontrado
 */
router.get('/documentos/:id', getDocumentoById)

/**
 * @swagger
 * /pacientes/{id}/documentos:
 *   post:
 *     summary: Upload de documento para paciente
 *     tags: [Documentos]
 *     security:
 *       - bearerAuth: []
 *     description: Envia um arquivo (multipart/form-data) para o storage e salva no banco
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do paciente
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               tipo:
 *                 type: string
 *                 example: pdf
 *     responses:
 *       201:
 *         description: Documento enviado com sucesso
 *       400:
 *         description: Dados inválidos
 *       403:
 *         description: Sem permissão
 */
router.post(
    '/pacientes/:id/documentos',
    upload.single('file'),
    createDocumento
)

/**
 * @swagger
 * /documentos/{id}:
 *   delete:
 *     summary: Deletar documento
 *     tags: [Documentos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do documento
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Documento deletado
 *       403:
 *         description: Sem permissão
 */
router.delete('/documentos/:id', deleteDocumento)

export default router