import {
    listarProdutos,
    buscarProdutoPorId,
    inserirProduto,
    atualizarProduto,
    alterarStatusProduto,
    deletarProduto,
    verificarRelacionamentosProdutoService
} from '../service/produtos.service.js'

// =========================
// LISTAR PRODUTOS
// =========================
export const getProdutos = async (req, res) => {

    try {

        const { data, error } =
            await listarProdutos(true)

        if (error) {
            return res.status(500).json({
                erro: error.message
            })
        }

        res.json(data)

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao listar produtos'
        })
    }
}

// =========================
// BUSCAR POR ID
// =========================
export const getProdutoById = async (req, res) => {

    try {

        const { id } = req.params

        const { data, error } =
            await buscarProdutoPorId(id)

        if (error || !data) {

            return res.status(404).json({
                erro: 'Produto não encontrado'
            })
        }

        res.json(data)

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao buscar produto'
        })
    }
}

// =========================
// CRIAR PRODUTO
// =========================
export const createProduto = async (req, res) => {

    try {

        if (req.user.perfil !== 'gestor') {

            return res.status(403).json({
                erro:
                    'Apenas gestor pode criar produtos'
            })
        }

        const {
            nome,
            descricao,
            unidade
        } = req.body

        if (!nome || !unidade) {

            return res.status(400).json({
                erro:
                    'Nome e unidade são obrigatórios'
            })
        }

        const { data, error } =
            await inserirProduto({
                nome,
                descricao,
                unidade
            })

        if (error) {

            return res.status(400).json({
                erro: error.message || error
            })
        }

        res.status(201).json(data)

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao criar produto'
        })
    }
}

// =========================
// ATUALIZAR PRODUTO
// =========================
export const updateProduto = async (req, res) => {

    try {

        if (req.user.perfil !== 'gestor') {

            return res.status(403).json({
                erro:
                    'Apenas gestor pode atualizar produtos'
            })
        }

        const { id } = req.params

        const { data, error } =
            await atualizarProduto(id, req.body)

        if (error) {

            return res.status(400).json({
                erro: error.message || error
            })
        }

        res.json(data)

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao atualizar produto'
        })
    }
}

// =========================
// ATIVAR / INATIVAR PRODUTO
// =========================
export const toggleStatusProduto =
    async (req, res) => {

    try {

        if (req.user.perfil !== 'gestor') {

            return res.status(403).json({
                erro:
                    'Apenas gestor pode alterar status'
            })
        }

        const { id } = req.params
        const { ativo } = req.body

        if (typeof ativo !== 'boolean') {

            return res.status(400).json({
                erro:
                    'Campo ativo deve ser boolean'
            })
        }

        const { data, error } =
            await alterarStatusProduto(
                id,
                ativo
            )

        if (error) {

            return res.status(500).json({
                erro: error.message
            })
        }

        return res.json(data)

    } catch (err) {

        return res.status(500).json({
            erro:
                'Erro ao alterar status do produto'
        })
    }
}

// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
export const verificarRelacionamentosProduto =
    async (req, res) => {

    try {

        if (req.user.perfil !== 'gestor') {

            return res.status(403).json({
                erro: 'Sem permissão'
            })
        }

        const { id } = req.params

        const { data, error } =
            await verificarRelacionamentosProdutoService(id)

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
// EXCLUIR PRODUTO
// =========================
export const deleteProduto = async (req, res) => {

    try {

        if (req.user.perfil !== 'gestor') {

            return res.status(403).json({
                erro:
                    'Apenas gestor pode excluir produtos'
            })
        }

        const { id } = req.params

        const {
            data: relacionamentos,
            error: relError
        } =
            await verificarRelacionamentosProdutoService(id)

        if (relError) {

            return res.status(500).json({
                erro: relError.message
            })
        }

        if (
            relacionamentos.possuiRelacionamentos
        ) {

            return res.status(400).json({
                erro:
                    'Produto possui vínculos',
                possuiRelacionamentos: true
            })
        }

        const { error } =
            await deletarProduto(id)

        if (error) {

            return res.status(500).json({
                erro: error.message
            })
        }

        return res.status(200).json({
            message:
                'Produto excluído com sucesso'
        })

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao excluir produto'
        })
    }
}