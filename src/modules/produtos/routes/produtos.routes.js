import express from 'express'
import {
    getProdutos,
    getProdutoById,
    createProduto,
    updateProduto,
    deleteProduto
} from '../controller/produtos.controller.js'

import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'

const router = express.Router()

// 🔒 rotas protegidas
router.use(authMiddleware)

/**
 * @swagger
 * /produtos:
 *   get:
 *     summary: Listar produtos
 *     tags: [Produtos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de produtos
 */
router.get('/', getProdutos)

/**
 * @swagger
 * /produtos/{id}:
 *   get:
 *     summary: Buscar produto por ID
 *     tags: [Produtos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do produto
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Produto encontrado
 *       404:
 *         description: Produto não encontrado
 */
router.get('/:id', getProdutoById)

/**
 * @swagger
 * /produtos:
 *   post:
 *     summary: Criar produto
 *     tags: [Produtos]
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
 *                 example: Cadeira de rodas
 *               descricao:
 *                 type: string
 *                 example: Equipamento de mobilidade
 *               quantidade:
 *                 type: integer
 *                 example: 10
 *               valor:
 *                 type: number
 *                 example: 1500.50
 *     responses:
 *       201:
 *         description: Produto criado com sucesso
 *       400:
 *         description: Dados inválidos
 */
router.post('/', createProduto)

/**
 * @swagger
 * /produtos/{id}:
 *   put:
 *     summary: Atualizar produto
 *     tags: [Produtos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do produto
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             nome: Produto atualizado
 *             quantidade: 20
 *             valor: 2000
 *     responses:
 *       200:
 *         description: Produto atualizado
 */
router.put('/:id', updateProduto)

/**
 * @swagger
 * /produtos/{id}:
 *   delete:
 *     summary: Deletar produto
 *     tags: [Produtos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do produto
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Produto deletado
 */
router.delete('/:id', deleteProduto)

export default router