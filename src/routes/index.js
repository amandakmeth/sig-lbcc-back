import express from 'express'
import usuariosRoutes from '../modules/usuarios/routes/usuarios.routes.js'
import authRoutes from '../modules/auth/routes/auth.routes.js'
import areasRoutes from '../modules/areas/routes/areas.routes.js'


const router = express.Router()

router.use('/usuarios', usuariosRoutes)
router.use('/auth', authRoutes)
router.use('/areas', areasRoutes)

router.get('/', (req, res) => {
    res.json({ status: 'API rodando' })
})

export default router