import express from 'express'

import {
    getAtendimentos,
    getAtendimentoById,
    createAtendimento,
    updateAtendimento,
    deleteAtendimento,
    verificarRelacionamentosAtendimento
} from '../controllers/atendimentos.controller.js'

import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'

const router = express.Router()

// PROTEGIDAS
router.use(authMiddleware)

/**
 * @swagger
 * tags:
 *   name: Atendimentos
 *   description: Gestão de atendimentos dos pacientes
 */

/**
 * @swagger
 * /atendimentos:
 *   get:
 *     summary: Listar atendimentos
 *     tags: [Atendimentos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de atendimentos
 */
router.get('/', getAtendimentos)

/**
 * @swagger
 * /atendimentos/{id}:
 *   get:
 *     summary: Buscar atendimento por ID
 *     tags: [Atendimentos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do atendimento
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Atendimento encontrado
 *       404:
 *         description: Atendimento não encontrado
 */
router.get('/:id', getAtendimentoById)

/**
 * @swagger
 * /atendimentos:
 *   post:
 *     summary: Registrar novo atendimento
 *     tags: [Atendimentos]
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
 *               - tipo
 *               - data_atendimento
 *               - descricao
 *             properties:
 *               paciente_id:
 *                 type: string
 *                 format: uuid
 *               area_id:
 *                 type: string
 *                 format: uuid
 *               cotacao_id:
 *                 type: string
 *                 format: uuid
 *               tipo:
 *                 type: string
 *                 enum:
 *                   - consulta
 *                   - exame
 *                   - procedimento
 *                   - internacao
 *                   - quimioterapia
 *                   - radioterapia
 *                   - outro
 *               data_atendimento:
 *                 type: string
 *                 format: date
 *               hora_atendimento:
 *                 type: string
 *                 example: "14:30:00"
 *               descricao:
 *                 type: string
 *               local:
 *                 type: string
 *               profissional:
 *                 type: string
 *               acompanhante:
 *                 type: string
 *               transporte:
 *                 type: string
 *               observacoes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Atendimento registrado com sucesso
 *       400:
 *         description: Dados inválidos
 */
router.post('/', createAtendimento)

/**
 * @swagger
 * /atendimentos/{id}:
 *   put:
 *     summary: Atualizar atendimento
 *     tags: [Atendimentos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do atendimento
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             descricao: Atendimento atualizado
 *             observacoes: Observação atualizada
 *     responses:
 *       200:
 *         description: Atendimento atualizado
 */
router.put('/:id', updateAtendimento)

/**
 * @swagger
 * /atendimentos/{id}/relacionamentos:
 *   get:
 *     summary: Verificar relacionamentos do atendimento
 *     tags: [Atendimentos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do atendimento
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Relacionamentos verificados
 *       403:
 *         description: Sem permissão
 */
router.get('/:id/relacionamentos', verificarRelacionamentosAtendimento)

/**
 * @swagger
 * /atendimentos/{id}:
 *   delete:
 *     summary: Excluir atendimento
 *     tags: [Atendimentos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do atendimento
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Atendimento excluído
 *       400:
 *         description: Atendimento possui vínculos
 *       403:
 *         description: Apenas gestor pode excluir
 */
router.delete('/:id', deleteAtendimento)

export default router
