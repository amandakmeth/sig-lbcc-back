import express from 'express'
import usuariosRoutes from '../modules/usuarios/routes/usuarios.routes.js'
import authRoutes from '../modules/auth/routes/auth.routes.js'
import areasRoutes from '../modules/areas/routes/areas.routes.js'
import produtosRoutes from '../modules/produtos/routes/produtos.routes.js'
import pacientesRoutes from '../modules/pacientes/routes/pacientes.routes.js'

const router = express.Router()

router.use('/usuarios', usuariosRoutes)
router.use('/auth', authRoutes)
router.use('/areas', areasRoutes)
router.use('/produtos', produtosRoutes)
router.use('/pacientes', pacientesRoutes)

router.get('/', (req, res) => {
    res.json({ status: 'API rodando' })
})

export default router