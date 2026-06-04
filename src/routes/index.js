import express from 'express'

import usuariosRoutes from '../modules/usuarios/routes/usuarios.routes.js'
import authRoutes from '../modules/auth/routes/auth.routes.js'
import areasRoutes from '../modules/areas/routes/areas.routes.js'
import produtosRoutes from '../modules/produtos/routes/produtos.routes.js'
import pacientesRoutes from '../modules/pacientes/routes/pacientes.routes.js'
import pacienteDocumentosRoutes from '../modules/paciente_documentos/routes/paciente_documentos.routes.js'
import fornecedoresRoutes from '../modules/fornecedores/routes/fornecedores.route.js'
import cotacoesRoutes from '../modules/cotacoes/routes/cotacoes.routes.js'
import cotacaoItensRoutes from '../modules/cotacao-itens/routes/cotacaoItens.routes.js'

const router = express.Router()

//Rotas públicas
router.use('/auth', authRoutes)

//Rotas protegidas por módulo
router.use('/usuarios', usuariosRoutes)
router.use('/areas', areasRoutes)
router.use('/produtos', produtosRoutes)
router.use('/pacientes', pacientesRoutes)
router.use('/fornecedores',fornecedoresRoutes)
router.use('/cotacoes',cotacoesRoutes)
router.use('/cotacao-itens', cotacaoItensRoutes)
//Documentos (usa rotas próprias internas)
router.use(pacienteDocumentosRoutes)

router.get('/', (req, res) => {
    res.json({ status: 'API rodando 🚀' })
})

export default router