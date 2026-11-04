import express from 'express';

import { authMiddleware } from '../../auth/middlewares/auth.middleware.js';
import upload from '../../../middlewares/upload.middleware.js';
import {
    getComprovacoesOF,
    getUrlEvidencia,
    getUtilizacoesOT,
    postComprovacaoOF,
    postFinalizarOT,
    postUtilizacaoOT
} from '../controllers/comprovacoes.controller.js';

const router = express.Router();
router.use(authMiddleware);

router.get('/of/:id', getComprovacoesOF);
router.post('/of/:id', upload.array('evidencias', 5), postComprovacaoOF);
router.get('/ot/:id', getUtilizacoesOT);
router.post('/ot/:id', upload.array('evidencias', 5), postUtilizacaoOT);
router.patch('/ot/:id/finalizar', postFinalizarOT);
router.get('/evidencias/:id/url', getUrlEvidencia);

export default router;
