
import express from 'express';

import {
    postOrdemTransporte,
    getOrdensTransporte,
    getOrdemTransporte,
    patchOrdemTransporte,
    getVoucherTransportePdf,
    postEntregaVoucherTransporte,
    postSegundaViaVoucherTransporte,
    getVouchersTransporte
} from '../controllers/ordensTransporte.controller.js';


import { authMiddleware } from '../../auth/middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

// Listar todas as Ordens de Transporte
router.get('/ordens', getOrdensTransporte);

// Consultar uma Ordem de Transporte específica
router.get('/ordens/:id', getOrdemTransporte);

// Editar uma OT pendente (permissão de gestor validada no controller)
router.patch('/ordens/:id', patchOrdemTransporte);

// Emitir uma Ordem de Transporte e gerar o voucher original
router.post('/ordens', (req, res, next) => {
    console.log('[RF_F11] POST /transporte/ordens chegou à rota');
    console.log('[RF_F11] Método:', req.method);
    console.log('[RF_F11] URL:', req.originalUrl);
    console.log('[RF_F11] Usuário autenticado:', Boolean(req.user));

    next();
}, postOrdemTransporte);

// Consultar/baixar PDF de voucher
router.get(
    '/ordens/:id/vouchers/:voucherId/pdf',
    getVoucherTransportePdf
);

// Registrar entrega do voucher
router.post(
    '/ordens/:id/vouchers/:voucherId/entrega',
    postEntregaVoucherTransporte
);

// Gerar segunda via do voucher
router.post(
    '/ordens/:id/vouchers/segunda-via',
    postSegundaViaVoucherTransporte
);
router.get('/ordens/:id/vouchers', getVouchersTransporte);
export default router;
