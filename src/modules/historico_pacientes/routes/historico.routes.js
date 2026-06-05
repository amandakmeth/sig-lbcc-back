import express from 'express'

import {
    getHistoricoPacientes,
    getHistoricoById,
    createHistorico,
    deleteHistorico
} from '../controllers/historico.controller.js'

import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'

const router = express.Router()

// PROTEGIDAS
router.use(authMiddleware)

/**
 * @swagger
 * tags:
 *   name: Histórico de Pacientes
 *   description: Histórico e auditoria dos pacientes
 */

/**
 * @swagger
 * /historico-pacientes:
 *   get:
 *     summary: Listar histórico dos pacientes
 *     tags: [Histórico de Pacientes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: paciente_id
 *         required: false
 *         description: Filtrar histórico por paciente
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Lista de registros do histórico
 */
router.get('/', getHistoricoPacientes)

/**
 * @swagger
 * /historico-pacientes/{id}:
 *   get:
 *     summary: Buscar registro do histórico por ID
 *     tags: [Histórico de Pacientes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do histórico
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Registro encontrado
 *       404:
 *         description: Registro não encontrado
 */
router.get('/:id', getHistoricoById)

/**
 * @swagger
 * /historico-pacientes:
 *   post:
 *     summary: Criar registro manual de histórico
 *     tags: [Histórico de Pacientes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paciente_id
 *               - tipo_evento
 *               - descricao
 *             properties:
 *               paciente_id:
 *                 type: string
 *                 format: uuid
 *               tipo_evento:
 *                 type: string
 *                 enum:
 *                   - ATENDIMENTO
 *                   - ALTERACAO_STATUS
 *                   - COTACAO_CRIADA
 *                   - COTACAO_EDITADA
 *                   - DOCUMENTO_ANEXADO
 *                   - DOCUMENTO_REMOVIDO
 *                   - ATENDIMENTO_REGISTRADO
 *                   - ATENDIMENTO_REMOVIDO
 *               descricao:
 *                 type: string
 *               referencia_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Histórico registrado com sucesso
 *       400:
 *         description: Dados inválidos
 */
router.post('/', createHistorico)

/**
 * @swagger
 * /historico-pacientes/{id}:
 *   delete:
 *     summary: Excluir registro do histórico
 *     tags: [Histórico de Pacientes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do registro
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Registro excluído
 *       403:
 *         description: Apenas gestor pode excluir
 */
router.delete('/:id', deleteHistorico)

export default router
