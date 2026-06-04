import express from 'express';

import {
    getItensCotacao,
    getItemById,
    createItemCotacao,
    updateItemCotacao,
    deleteItemCotacao
} from '../controllers/cotacaoItens.controller.js';

import { authMiddleware }
from '../../auth/middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get(
    '/cotacao/:cotacaoId',
    getItensCotacao
);

router.get(
    '/:id',
    getItemById
);

router.post(
    '/cotacao/:cotacaoId',
    createItemCotacao
);

router.put(
    '/:id',
    updateItemCotacao
);

router.delete(
    '/:id',
    deleteItemCotacao
);

export default router;