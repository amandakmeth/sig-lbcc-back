import express from 'express';

import { authMiddleware } from '../../auth/middlewares/auth.middleware.js';
import upload from '../../../middlewares/upload.middleware.js';
import {
    getDivergencia,
    getDivergencias,
    getSolicitacoesCancelamento,
    patchDecisaoCancelamento,
    patchImpedimento,
    patchStatusDivergencia,
    postCorrecao,
    postDivergencia,
    postEvidencias,
    postProvidencia,
    postSolicitarCancelamento,
    postSubstituirVoucher
} from '../controllers/divergencias.controller.js';

const router = express.Router();
router.use(authMiddleware);

router.get('/cancelamentos', getSolicitacoesCancelamento);
router.patch('/cancelamentos/:id/decisao', patchDecisaoCancelamento);
router.get('/', getDivergencias);
router.post('/', postDivergencia);
router.get('/:id', getDivergencia);
router.patch('/:id/status', patchStatusDivergencia);
router.patch('/:id/impeditiva', patchImpedimento);
router.post('/:id/providencias', upload.array('evidencias', 5), postProvidencia);
router.post('/:id/evidencias', upload.array('evidencias', 5), postEvidencias);
router.post('/:id/providencias/:providenciaId/evidencias', upload.array('evidencias', 5), postEvidencias);
router.post('/:id/correcoes', postCorrecao);
router.post('/:id/vouchers/substituir', postSubstituirVoucher);
router.post('/:id/cancelamentos', postSolicitarCancelamento);

export default router;
