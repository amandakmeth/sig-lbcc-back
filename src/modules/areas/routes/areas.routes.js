import express from 'express'
import {
    getAreas,
    getAreaById,
    createArea,
    updateArea,
    deleteArea
} from '../controllers/areas.controller.js'
import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'

const router = express.Router()

//protegidas
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
 * /areas/{id}:
 *   delete:
 *     summary: Desativar área
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
 *         description: Área desativada
 */
router.delete('/:id', deleteArea)

export default router