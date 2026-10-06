import express from 'express';

import {
    gerarOrdens,
    listarOrdens,
    buscarOrdem,
    confirmarRecebimento,
    finalizarOrdem,
    listarGestores,
    atualizarPrazo,
    atualizarStatusPrazo,
    obterLembreteFornecedor,
    reenviarLembreteFornecedor,
    reenviarEmailOrdem,
    baixarPdfOrdem
} from '../controller/fornecimento.controller.js';

import { authMiddleware } from '../../auth/middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

/**
 * @swagger
 * tags:
 *   name: Fornecimento
 *   description: Gestão de ordens de fornecimento
 */


// =========================
// GERAR ORDENS DE FORNECIMENTO
// =========================

/**
 * @swagger
 * /fornecimento/cotacoes/{cotacaoId}/gerar:
 *   post:
 *     summary: Gera as ordens de fornecimento de uma cotação
 *     description: Gera uma ordem de fornecimento para cada fornecedor vencedor da cotação, agrupando os itens vencidos pelo mesmo fornecedor. A cotação precisa estar finalizada.
 *     tags: [Fornecimento]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cotacaoId
 *         required: true
 *         description: ID da cotação finalizada
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       201:
 *         description: Ordens de fornecimento geradas com sucesso
 *       400:
 *         description: Cotação não encontrada, não está finalizada ou não possui vencedores
 *       401:
 *         description: Sem autenticação
 *       500:
 *         description: Erro interno ao gerar ordens de fornecimento
 */

router.post(
    '/cotacoes/:cotacaoId/gerar',
    gerarOrdens
);


// =========================
// LISTAR ORDENS DE FORNECIMENTO
// =========================

/**
 * @swagger
 * /fornecimento:
 *   get:
 *     summary: Lista as ordens de fornecimento
 *     description: Retorna todas as ordens de fornecimento cadastradas, incluindo seus itens e dados do fornecedor.
 *     tags: [Fornecimento]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de ordens de fornecimento retornada com sucesso
 *       401:
 *         description: Sem autenticação
 *       500:
 *         description: Erro interno ao listar ordens de fornecimento
 */

router.get(
    '/',
    listarOrdens
);

router.get(
    '/gestores-responsaveis',
    listarGestores
);


// =========================
// CONFIRMAR RECEBIMENTO
// =========================

/**
 * @swagger
 * /fornecimento/{id}/confirmar-recebimento:
 *   patch:
 *     summary: Confirma o recebimento da ordem de fornecimento
 *     description: Registra a confirmação de recebimento da Ordem de Fornecimento pelo fornecedor e altera seu status de enviada para em_entrega.
 *     tags: [Fornecimento]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID da ordem de fornecimento
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Recebimento confirmado com sucesso
 *       400:
 *         description: Ordem inexistente ou não está com status enviada
 *       401:
 *         description: Sem autenticação
 *       500:
 *         description: Erro interno ao confirmar recebimento
 */

router.patch(
    '/:id/confirmar-recebimento',
    confirmarRecebimento
);

router.patch(
    '/:id/finalizar',
    finalizarOrdem
);

router.patch(
    '/:id/prazo',
    atualizarPrazo
);

router.patch(
    '/:id/status-prazo',
    atualizarStatusPrazo
);

router.get(
    '/:id/lembrete-fornecedor',
    obterLembreteFornecedor
);

router.post(
    '/:id/lembrete-fornecedor/reenvio',
    reenviarLembreteFornecedor
);

router.post(
    '/:id/email/reenvio',
    reenviarEmailOrdem
);

router.get(
    '/:id/pdf',
    baixarPdfOrdem
);


// =========================
// BUSCAR ORDEM DE FORNECIMENTO
// =========================

/**
 * @swagger
 * /fornecimento/{id}:
 *   get:
 *     summary: Busca uma ordem de fornecimento
 *     description: Retorna os dados de uma ordem de fornecimento específica, incluindo seus itens e dados do fornecedor.
 *     tags: [Fornecimento]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID da ordem de fornecimento
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Ordem de fornecimento encontrada
 *       401:
 *         description: Sem autenticação
 *       404:
 *         description: Ordem de fornecimento não encontrada
 *       500:
 *         description: Erro interno ao buscar ordem de fornecimento
 */

router.get(
    '/:id',
    buscarOrdem
);


export default router;
