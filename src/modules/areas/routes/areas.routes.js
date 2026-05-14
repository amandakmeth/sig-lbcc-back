import express from 'express'

import {
    getAreas,
    getAreaById,
    createArea,
    updateArea,
    deleteArea,
    verificarRelacionamentosArea
} from '../controllers/areas.controller.js'

import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'

const router = express.Router()

// PROTEGIDAS
router.use(authMiddleware)

/**
 * @swagger
 * /areas:
 *   get:
 *     summary: Listar áreas de atendimento
 *     tags: [Áreas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de áreas
 */
router.get('/', getAreas)

/**
 * @swagger
 * /areas/{id}:
 *   get:
 *     summary: Buscar área por ID
 *     tags: [Áreas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID da área
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Área encontrada
 *       404:
 *         description: Área não encontrada
 */
router.get('/:id', getAreaById)

/**
 * @swagger
 * /areas:
 *   post:
 *     summary: Criar nova área de atendimento
 *     tags: [Áreas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *             properties:
 *               nome:
 *                 type: string
 *                 example: Transporte
 *               descricao:
 *                 type: string
 *                 example: Transporte de pacientes
 *     responses:
 *       201:
 *         description: Área criada com sucesso
 *       400:
 *         description: Dados inválidos
 */
router.post('/', createArea)

/**
 * @swagger
 * /areas/{id}:
 *   put:
 *     summary: Atualizar área
 *     tags: [Áreas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID da área
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             nome: Alimentação
 *             descricao: Cestas básicas
 *     responses:
 *       200:
 *         description: Área atualizada
 */
router.put('/:id', updateArea)

/**
 * @swagger
 * /areas/{id}/relacionamentos:
 *   get:
 *     summary: Verificar relacionamentos da área
 *     tags: [Áreas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID da área
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Relacionamentos verificados
 *       403:
 *         description: Sem permissão
 */
router.get(
    '/:id/relacionamentos',
    verificarRelacionamentosArea
)

/**
 * @swagger
 * /areas/{id}:
 *   delete:
 *     summary: Excluir área definitivamente
 *     tags: [Áreas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID da área
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Área excluída
 *       400:
 *         description: Área possui vínculos
 *       403:
 *         description: Apenas gestor pode excluir
 */
router.delete('/:id', deleteArea)

export default router