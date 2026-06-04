import express from 'express';

import {
    getCotacoes,
    getCotacaoById,
    createCotacao,
    updateCotacao,
    toggleStatusCotacao,
    deleteCotacao,
    verificarRelacionamentosCotacao
} from '../controllers/cotacoes.controller.js';

import { authMiddleware } from '../../auth/middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

/**
 * @swagger
 * tags:
 *   name: Cotações
 *   description: Gestão de cotações
 */

// =========================
// LISTAR
// =========================
/**
 * @swagger
 * /cotacoes:
 *   get:
 *     summary: Lista todas as cotações
 *     tags: [Cotações]
 *     parameters:
 *       - in: query
 *         name: ativo
 *         schema:
 *           type: boolean
 *         description: Filtrar cotações ativas ou inativas (default true)
 *     responses:
 *       200:
 *         description: Lista de cotações
 */
router.get('/', getCotacoes);

// =========================
// BUSCAR POR ID
// =========================
/**
 * @swagger
 * /cotacoes/{id}:
 *   get:
 *     summary: Busca cotação por ID
 *     tags: [Cotações]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Cotação encontrada
 *       404:
 *         description: Cotação não encontrada
 */
router.get('/:id', getCotacaoById);

// =========================
// CRIAR
// =========================
/**
 * @swagger
 * /cotacoes:
 *   post:
 *     summary: Cria uma nova cotação
 *     tags: [Cotações]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - descricao
 *               - data_validade
 *               - paciente_id
 *               - area_id
 *             properties:
 *               descricao:
 *                 type: string
 *               data_validade:
 *                 type: string
 *                 format: date
 *               observacoes:
 *                 type: string
 *               paciente_id:
 *                 type: string
 *                 format: uuid
 *               area_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Cotação criada com sucesso
 *       400:
 *         description: Erro de validação
 */
router.post('/', createCotacao);

// =========================
// ATUALIZAR
// =========================
/**
 * @swagger
 * /cotacoes/{id}:
 *   put:
 *     summary: Atualiza uma cotação
 *     tags: [Cotações]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               descricao:
 *                 type: string
 *               data_validade:
 *                 type: string
 *                 format: date
 *               observacoes:
 *                 type: string
 *               paciente_id:
 *                 type: string
 *                 format: uuid
 *               area_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Cotação atualizada
 */
router.put('/:id', updateCotacao);

// =========================
// STATUS (SOFT DELETE)
// =========================
/**
 * @swagger
 * /cotacoes/{id}/status:
 *   patch:
 *     summary: Ativa ou inativa uma cotação (soft delete)
 *     tags: [Cotações]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ativo
 *             properties:
 *               ativo:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Status atualizado com sucesso
 */
router.patch('/:id/status', toggleStatusCotacao);

// =========================
// DELETE (HARD DELETE COM VALIDAÇÃO)
// =========================
/**
 * @swagger
 * /cotacoes/{id}:
 *   delete:
 *     summary: Remove uma cotação (somente se não houver vínculos)
 *     tags: [Cotações]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Cotação excluída com sucesso
 *       400:
 *         description: Cotação possui vínculos e não pode ser excluída
 *       403:
 *         description: Sem permissão
 */
router.delete('/:id', deleteCotacao);

// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
/**
 * @swagger
 * /cotacoes/{id}/relacionamentos:
 *   get:
 *     summary: Verificar relacionamentos da cotação
 *     tags: [Cotações]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID da cotação
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Relacionamentos verificados com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 possuiRelacionamentos:
 *                   type: boolean
 *                 relacionamentos:
 *                   type: object
 *                   properties:
 *                     propostas:
 *                       type: integer
 *                     itens:
 *                       type: integer
 *       403:
 *         description: Sem permissão
 *       500:
 *         description: Erro interno
 */
router.get('/:id/relacionamentos', verificarRelacionamentosCotacao);

export default router;