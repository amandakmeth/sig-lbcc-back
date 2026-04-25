import express from 'express'
import {
    getAreas,
    getAreaById,
    createArea,
    updateArea,
    deleteArea
} from '../controllers/areas.controller.js'
import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'

const router = express.Router()

//protegidas
router.use(authMiddleware)

router.get('/', getAreas)
router.get('/:id', getAreaById)
router.post('/', createArea)
router.put('/:id', updateArea)
router.delete('/:id', deleteArea)

export default router