import {
    listarFornecedores,
    buscarFornecedorPorId,
    inserirFornecedor,
    atualizarFornecedor,
    alterarStatusFornecedor,
    deletarFornecedor,
    verificarRelacionamentosFornecedorService
} from '../services/fornecedores.service.js'

// =========================
// LISTAR FORNECEDORES
// =========================
export const getFornecedores = async (req, res) => {
    try {

        const { data: fornecedores, error } =
            await listarFornecedores()

        if (error) {
            return res.status(500).json({
                erro: error.message
            })
        }

        const fornecedoresComVinculos =
            await Promise.all(

                fornecedores.map(async (fornecedor) => {

                    const { data, error: relError } =
                        await verificarRelacionamentosFornecedorService(
                            fornecedor.id
                        )

                    return {
                        ...fornecedor,
                        fornecedorTemVinculos:
                            relError
                                ? false
                                : (data?.possuiRelacionamentos ?? false)
                    }
                })
            )

        return res.json(fornecedoresComVinculos)

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao listar fornecedores'
        })
    }
}

// =========================
// BUSCAR FORNECEDOR POR ID
// =========================
export const getFornecedorById = async (req, res) => {
    try {

        const { id } = req.params

        const { data, error } =
            await buscarFornecedorPorId(id)

        if (error || !data) {
            return res.status(404).json({
                erro: 'Fornecedor não encontrado'
            })
        }

        return res.json(data)

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao buscar fornecedor'
        })
    }
}

// =========================
// CRIAR FORNECEDOR
// =========================
export const createFornecedor = async (req, res) => {
    try {

        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({
                erro: 'Apenas gestor pode criar fornecedores'
            })
        }

        const { razao_social } = req.body

        if (!razao_social) {
            return res.status(400).json({
                erro: 'Razão social é obrigatória'
            })
        }

        const { data, error } =
            await inserirFornecedor(req.body)

        if (error) {
            return res.status(400).json({
                erro: error.message || error
            })
        }

        return res.status(201).json(data)

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao criar fornecedor'
        })
    }
}

// =========================
// ATUALIZAR FORNECEDOR
// =========================
export const updateFornecedor = async (req, res) => {
    try {

        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({
                erro: 'Apenas gestor pode atualizar fornecedores'
            })
        }

        const { id } = req.params

        const { data, error } =
            await atualizarFornecedor(
                id,
                req.body
            )

        if (error) {
            return res.status(400).json({
                erro: error.message || error
            })
        }

        return res.json(data)

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao atualizar fornecedor'
        })
    }
}

// =========================
// ATIVAR / INATIVAR
// =========================
export const toggleStatusFornecedor = async (req, res) => {
    try {

        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({
                erro: 'Apenas gestor pode alterar status'
            })
        }

        const { id } = req.params

        const { data, error } =
            await alterarStatusFornecedor(id)

        if (error) {
            return res.status(500).json({
                erro: error.message
            })
        }

        return res.json(data)

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao alterar status do fornecedor'
        })
    }
}

// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
export const verificarRelacionamentosFornecedor =
    async (req, res) => {

    try {

        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({
                erro: 'Sem permissão'
            })
        }

        const { id } = req.params

        const { data, error } =
            await verificarRelacionamentosFornecedorService(id)

        if (error) {
            return res.status(500).json({
                erro: error.message
            })
        }

        return res.json(data)

    } catch (err) {

        return res.status(500).json({
            erro:
                'Erro ao verificar relacionamentos'
        })
    }
}

// =========================
// EXCLUIR FORNECEDOR
// =========================
export const deleteFornecedor = async (req, res) => {

    try {

        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({
                erro: 'Apenas gestor pode excluir fornecedores'
            })
        }

        const { id } = req.params

        const {
            data: relacionamentos,
            error: relError
        } =
            await verificarRelacionamentosFornecedorService(
                id
            )

        if (relError) {
            return res.status(500).json({
                erro: relError.message
            })
        }

        if (
            relacionamentos.possuiRelacionamentos
        ) {

            return res.status(400).json({
                erro: 'Fornecedor possui vínculos',
                fornecedorTemVinculos: true,
                relacionamentos:
                    relacionamentos.relacionamentos
            })
        }

        const { error } =
            await deletarFornecedor(id)

        if (error) {
            return res.status(500).json({
                erro: error.message
            })
        }

        return res.status(200).json({
            message: 'Fornecedor excluído com sucesso'
        })

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao excluir fornecedor'
        })
    }
}