import express from 'express'

import {
    getFornecedores,
    getFornecedorById,
    createFornecedor,
    updateFornecedor,
    toggleStatusFornecedor,
    deleteFornecedor,
    verificarRelacionamentosFornecedor
} from '../controllers/fornecedores.controller.js'

import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'

const router = express.Router()

// PROTEGIDAS
router.use(authMiddleware)

/**
 * @swagger
 * tags:
 *   name: Fornecedores
 *   description: Gestão de fornecedores
 */

/**
 * @swagger
 * /fornecedores:
 *   get:
 *     summary: Listar fornecedores
 *     tags: [Fornecedores]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de fornecedores
 */
router.get('/', getFornecedores)

/**
 * @swagger
 * /fornecedores:
 *   post:
 *     summary: Criar fornecedor
 *     tags: [Fornecedores]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - razao_social
 *             properties:
 *               razao_social:
 *                 type: string
 *                 example: Posto Avenida LTDA
 *               nome_fantasia:
 *                 type: string
 *                 example: Posto Avenida
 *               cnpj:
 *                 type: string
 *                 example: 12.345.678/0001-99
 *               telefone:
 *                 type: string
 *                 example: (43) 99999-9999
 *               email:
 *                 type: string
 *                 example: contato@postoavenida.com.br
 *     responses:
 *       201:
 *         description: Fornecedor criado com sucesso
 *       400:
 *         description: Dados inválidos
 *       403:
 *         description: Sem permissão
 */
router.post('/', createFornecedor)

/**
 * @swagger
 * /fornecedores/{id}:
 *   get:
 *     summary: Buscar fornecedor por ID
 *     tags: [Fornecedores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do fornecedor
 *     responses:
 *       200:
 *         description: Fornecedor encontrado
 *       404:
 *         description: Fornecedor não encontrado
 */
router.get('/:id', getFornecedorById)

/**
 * @swagger
 * /fornecedores/{id}:
 *   put:
 *     summary: Atualizar fornecedor
 *     tags: [Fornecedores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           example:
 *             nome_fantasia: Posto Avenida Atualizado
 *             telefone: (43) 98888-8888
 *             email: novoemail@posto.com.br
 *     responses:
 *       200:
 *         description: Fornecedor atualizado
 */
router.put('/:id', updateFornecedor)

/**
 * @swagger
 * /fornecedores/{id}/status:
 *   patch:
 *     summary: Ativar ou inativar fornecedor
 *     tags: [Fornecedores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status alterado com sucesso
 *       403:
 *         description: Sem permissão
 */
router.patch('/:id/status', toggleStatusFornecedor)

/**
 * @swagger
 * /fornecedores/{id}/relacionamentos:
 *   get:
 *     summary: Verificar relacionamentos do fornecedor
 *     tags: [Fornecedores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Relacionamentos verificados
 *       403:
 *         description: Sem permissão
 */
router.get('/:id/relacionamentos', verificarRelacionamentosFornecedor)

/**
 * @swagger
 * /fornecedores/{id}:
 *   delete:
 *     summary: Excluir fornecedor
 *     tags: [Fornecedores]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Fornecedor excluído
 *       400:
 *         description: Fornecedor possui vínculos
 *       403:
 *         description: Sem permissão
 */
router.delete('/:id', deleteFornecedor)

export default router