import express from 'express'
import {
    getProdutos,
    getProdutoById,
    createProduto,
    updateProduto,
    deleteProduto
} from '../controller/produtos.controller.js'

import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'

const router = express.Router()

// rotas protegidas
router.use(authMiddleware)

router.get('/', getProdutos)
router.get('/:id', getProdutoById)
router.post('/', createProduto)
router.put('/:id', updateProduto)
router.delete('/:id', deleteProduto)

export default router