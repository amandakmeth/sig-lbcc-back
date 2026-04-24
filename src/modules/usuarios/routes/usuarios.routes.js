import express from 'express'
import {
    getUsuarios,
    getUsuarioById,
    createUsuario,
    updateUsuario,
    deleteUsuario
} from '../controllers/usuarios.controller.js'
import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'

const router = express.Router()

router.use(authMiddleware)

router.get('/', getUsuarios)
router.get('/:id', getUsuarioById)
router.post('/', createUsuario)
router.put('/:id', updateUsuario)
router.delete('/:id', deleteUsuario)

export default router