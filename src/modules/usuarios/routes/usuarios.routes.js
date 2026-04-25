import express from 'express'
import {
    getUsuarios,
    getUsuarioById,
    createUsuario,
    updateUsuario,
    deleteUsuario
} from '../controllers/usuarios.controller.js'
import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'

const router = express.Router()

router.use(authMiddleware)

/**
 * @swagger
 * /usuarios:
 *   get:
 *     summary: Listar usuários
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuários
 *       403:
 *         description: Sem permissão
 */
router.get('/', getUsuarios)

/**
 * @swagger
 * /usuarios/{id}:
 *   get:
 *     summary: Buscar usuário por ID
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do usuário
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usuário encontrado
 *       403:
 *         description: Acesso negado
 *       404:
 *         description: Usuário não encontrado
 */
router.get('/:id', getUsuarioById)

/**
 * @swagger
 * /usuarios:
 *   post:
 *     summary: Criar novo usuário
 *     tags: [Usuários]
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
 *               - email
 *               - senha
 *             properties:
 *               nome:
 *                 type: string
 *                 example: João da Silva
 *               email:
 *                 type: string
 *                 example: joao@email.com
 *               perfil:
 *                 type: string
 *                 example: operador
 *               senha:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       201:
 *         description: Usuário criado com sucesso
 *       403:
 *         description: Apenas gestor pode criar usuários
 *       400:
 *         description: Dados inválidos
 */
router.post('/', createUsuario)

/**
 * @swagger
 * /usuarios/{id}:
 *   put:
 *     summary: Atualizar usuário
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do usuário
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             nome: Novo Nome
 *             email: novo@email.com
 *     responses:
 *       200:
 *         description: Usuário atualizado
 *       403:
 *         description: Acesso negado
 */
router.put('/:id', updateUsuario)

/**
 * @swagger
 * /usuarios/{id}:
 *   delete:
 *     summary: Deletar usuário
 *     tags: [Usuários]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do usuário
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usuário deletado
 *       403:
 *         description: Apenas gestor pode excluir
 */
router.delete('/:id', deleteUsuario)

export default router