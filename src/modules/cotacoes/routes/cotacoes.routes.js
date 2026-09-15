import express from 'express';

import {
    getCotacoes,
    getCotacaoById,
    createCotacao,
    updateCotacao,
    toggleStatusCotacao,
    deleteCotacao,
    verificarRelacionamentosCotacao,
    alterarStatusProgresso
} from '../controllers/cotacoes.controller.js';

import { createOrcamentosItem } from '../controllers/cotacaoOrcamentos.controller.js';

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

/**
 * @swagger
 * /cotacoes/{id}/itens/{itemId}/orcamentos:
 *   post:
 *     summary: Lança orçamentos em um item da cotação
 *     tags: [Cotações]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             minItems: 1
 *             items:
 *               type: object
 *               required:
 *                 - fornecedor_id
 *                 - valor_unitario
 *               properties:
 *                 fornecedor_id:
 *                   type: string
 *                   format: uuid
 *                 valor_unitario:
 *                   type: number
 *                   minimum: 0.01
 *                 observacoes:
 *                   type: string
 *     responses:
 *       201:
 *         description: Cotação com os orçamentos aninhados nos itens
 *       400:
 *         description: Erro de validação
 *       401:
 *         description: Sem autenticação
 *       403:
 *         description: Sem permissão
 */
router.post(
    '/:id/itens/:itemId/orcamentos',
    createOrcamentosItem
);


// =========================
// CRIAR
// =========================
/**
 * @swagger
 * /cotacoes:
 *   post:
 *     summary: Cria uma nova cotação com seus itens
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
 *               - itens
 *             properties:
 *               descricao:
 *                 type: string
 *                 example: Cotação de medicamentos
 *               data_validade:
 *                 type: string
 *                 format: date
 *                 example: 2026-12-31
 *               observacoes:
 *                 type: string
 *                 example: Cotação para atendimento do paciente
 *               paciente_id:
 *                 type: string
 *                 format: uuid
 *               area_id:
 *                 type: string
 *                 format: uuid
 *               itens:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required:
 *                     - descricao
 *                     - quantidade
 *                     - unidade
 *                   properties:
 *                     produto_id:
 *                       type: string
 *                       format: uuid
 *                     descricao:
 *                       type: string
 *                       example: Dipirona 500mg
 *                     quantidade:
 *                       type: number
 *                       minimum: 0.01
 *                       example: 2
 *                     unidade:
 *                       type: string
 *                       example: UN
 *                     especificacoes:
 *                       type: string
 *                       example: Caixa com 20 comprimidos
 *                     ordem:
 *                       type: integer
 *                       example: 1
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
 *     summary: Atualiza os dados de uma cotação
 *     description: Atualiza somente os dados cadastrais da cotação. O status de progresso deve ser alterado exclusivamente pela rota status-progresso.
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
 *                 example: Cotação atualizada
 *               data_validade:
 *                 type: string
 *                 format: date
 *                 example: 2026-12-31
 *               observacoes:
 *                 type: string
 *                 example: Observações atualizadas
 *               paciente_id:
 *                 type: string
 *                 format: uuid
 *               area_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Cotação atualizada
 *       400:
 *         description: Erro de atualização
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Cotação não encontrada
 */
router.put('/:id', updateCotacao);


// =========================
// STATUS DE ATIVAÇÃO
// =========================
/**
 * @swagger
 * /cotacoes/{id}/status:
 *   patch:
 *     summary: Ativa ou inativa uma cotação
 *     description: Altera somente o campo ativo do registro. Não altera o status de progresso da cotação.
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
 *         description: Status de ativação atualizado com sucesso
 *       400:
 *         description: Erro ao alterar status de ativação
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Cotação não encontrada
 */
router.patch('/:id/status', toggleStatusCotacao);


// =========================
// STATUS DE PROGRESSO
// =========================
/**
 * @swagger
 * /cotacoes/{id}/status-progresso:
 *   patch:
 *     summary: Altera o status de progresso da cotação
 *     description: Altera o status do processo da cotação. Para cancelar, o motivo_cancelamento é obrigatório. Cotações finalizadas ou canceladas não podem ter seu status alterado novamente.
 *     tags: [Cotações]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID da cotação
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum:
 *                   - aberta
 *                   - em_andamento
 *                   - pronta_para_analise
 *                   - finalizada
 *                   - cancelada
 *                 example: em_andamento
 *               motivo_cancelamento:
 *                 type: string
 *                 description: Motivo obrigatório quando o status for cancelada.
 *                 example: Cotação cancelada por solicitação do setor.
 *     responses:
 *       200:
 *         description: Status de progresso alterado com sucesso
 *       400:
 *         description: Status inválido, motivo de cancelamento não informado ou cotação não pode mais ter o status alterado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Cotação não encontrada
 */
router.patch(
    '/:id/status-progresso',
    alterarStatusProgresso
);


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
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Cotação não encontrada
 *       500:
 *         description: Erro interno
 */
router.get(
    '/:id/relacionamentos',
    verificarRelacionamentosCotacao
);


// =========================
// CANCELAR COTAÇÃO
// =========================
/**
 * @swagger
 * /cotacoes/{id}:
 *   delete:
 *     summary: Cancela uma cotação
 *     description: Realiza o cancelamento lógico da cotação, alterando seu status para cancelada. O registro, seus itens e propostas permanecem no banco. O motivo do cancelamento é obrigatório.
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
 *               - motivo_cancelamento
 *             properties:
 *               motivo_cancelamento:
 *                 type: string
 *                 description: Motivo obrigatório para o cancelamento da cotação.
 *                 example: Cotação cancelada por solicitação do setor.
 *     responses:
 *       200:
 *         description: Cotação cancelada com sucesso
 *       400:
 *         description: Motivo não informado, cotação já finalizada ou cotação já cancelada
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Cotação não encontrada
 */
router.delete('/:id', deleteCotacao);


export default router;