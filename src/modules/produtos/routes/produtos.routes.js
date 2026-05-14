import express from 'express'

import {
    getProdutos,
    getProdutoById,
    createProduto,
    updateProduto,
    deleteProduto,
    toggleStatusProduto,
    verificarRelacionamentosProduto
} from '../controller/produtos.controller.js'

import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'

const router = express.Router()

// ROTAS PROTEGIDAS
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
 *               - unidade
 *             properties:
 *               nome:
 *                 type: string
 *                 example: Cadeira de rodas
 *               descricao:
 *                 type: string
 *                 example: Equipamento de mobilidade
 *               unidade:
 *                 type: string
 *                 example: UN
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
 *             descricao: Nova descrição
 *             unidade: CX
 *     responses:
 *       200:
 *         description: Produto atualizado
 */
router.put('/:id', updateProduto)

/**
 * @swagger
 * /produtos/{id}/status:
 *   patch:
 *     summary: Ativar ou inativar produto
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ativo:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Status alterado com sucesso
 *       403:
 *         description: Apenas gestor pode alterar status
 */
router.patch('/:id/status', toggleStatusProduto)

/**
 * @swagger
 * /produtos/{id}/relacionamentos:
 *   get:
 *     summary: Verificar relacionamentos do produto
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
 *         description: Relacionamentos verificados
 *       403:
 *         description: Sem permissão
 */
router.get(
    '/:id/relacionamentos',
    verificarRelacionamentosProduto
)

/**
 * @swagger
 * /produtos/{id}:
 *   delete:
 *     summary: Excluir produto definitivamente
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
 *         description: Produto excluído
 *       400:
 *         description: Produto possui vínculos
 *       403:
 *         description: Apenas gestor pode excluir
 */
router.delete('/:id', deleteProduto)

export default router