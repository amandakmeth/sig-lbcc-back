
import express from 'express';
import { authMiddleware } from '../../auth/middlewares/auth.middleware.js';
import { obterRelatorioPorPeriodo } from '../controllers/relatorios.controller.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/periodo', obterRelatorioPorPeriodo);

export default router;
