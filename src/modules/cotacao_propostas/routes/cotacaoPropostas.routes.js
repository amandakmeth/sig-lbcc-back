import express from "express";

import {
    getPropostas,
    getPropostaById,
    createProposta,
    updateProposta,
    deleteProposta
} from "../controllers/cotacaoPropostas.controller.js";

import { authMiddleware } from "../../auth/middlewares/auth.middleware.js";

const router = express.Router();

router.use(authMiddleware);

/**
 * @swagger
 * tags:
 *   name: Orçamentos
 *   description: Registro e gerenciamento de orçamentos/propostas
 */

// =========================
// LISTAR
// =========================

/**
 * @swagger
 * /cotacao-propostas:
 *   get:
 *     summary: Lista os orçamentos
 *     tags: [Orçamentos]
 *     parameters:
 *       - in: query
 *         name: cotacao_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filtra os orçamentos de uma cotação
 *     responses:
 *       200:
 *         description: Lista de orçamentos
 */
router.get("/", getPropostas);


// =========================
// BUSCAR POR ID
// =========================

/**
 * @swagger
 * /cotacao-propostas/{id}:
 *   get:
 *     summary: Busca um orçamento por ID
 *     tags: [Orçamentos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Orçamento encontrado
 *       404:
 *         description: Orçamento não encontrado
 */
router.get("/:id", getPropostaById);


// =========================
// CRIAR
// =========================

/**
 * @swagger
 * /cotacao-propostas:
 *   post:
 *     summary: Registra um novo orçamento
 *     tags: [Orçamentos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cotacao_id
 *               - fornecedor_id
 *               - data_proposta
 *               - itens
 *             properties:
 *               cotacao_id:
 *                 type: string
 *                 format: uuid
 *               fornecedor_id:
 *                 type: string
 *                 format: uuid
 *               data_proposta:
 *                 type: string
 *                 format: date
 *               validade_proposta:
 *                 type: string
 *                 format: date
 *               prazo_entrega:
 *                 type: string
 *               condicoes_pagamento:
 *                 type: string
 *               observacoes:
 *                 type: string
 *               itens:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - item_id
 *                     - valor_unitario
 *                   properties:
 *                     item_id:
 *                       type: string
 *                       format: uuid
 *                     valor_unitario:
 *                       type: number
 *                     observacoes:
 *                       type: string
 *     responses:
 *       201:
 *         description: Orçamento criado com sucesso
 *       400:
 *         description: Erro de validação
 */
router.post("/", createProposta);


// =========================
// ATUALIZAR
// =========================

/**
 * @swagger
 * /cotacao-propostas/{id}:
 *   put:
 *     summary: Atualiza um orçamento
 *     tags: [Orçamentos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Orçamento atualizado
 */
router.put("/:id", updateProposta);


// =========================
// DELETE
// =========================

/**
 * @swagger
 * /cotacao-propostas/{id}:
 *   delete:
 *     summary: Exclui um orçamento
 *     tags: [Orçamentos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Orçamento excluído
 */
router.delete("/:id", deleteProposta);


export default router;