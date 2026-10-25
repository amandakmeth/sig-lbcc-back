
import express from 'express';

import {
    postOrdemTransporte,
    getVoucherTransportePdf,
    postEntregaVoucherTransporte,
    postSegundaViaVoucherTransporte
} from '../controllers/ordensTransporte.controller.js';

import { authMiddleware } from '../../auth/middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/ordens', (req, res, next) => {
    console.log('[RF_F11] POST /transporte/ordens chegou à rota');
    console.log('[RF_F11] Método:', req.method);
    console.log('[RF_F11] URL:', req.originalUrl);
    console.log('[RF_F11] Usuário autenticado:', Boolean(req.user));

    next();
}, postOrdemTransporte);

router.get(
    '/ordens/:id/vouchers/:voucherId/pdf',
    getVoucherTransportePdf
);

router.post(
    '/ordens/:id/vouchers/:voucherId/entrega',
    postEntregaVoucherTransporte
);

router.post(
    '/ordens/:id/vouchers/segunda-via',
    postSegundaViaVoucherTransporte
);

export default router;
