import {
    listarProdutos,
    buscarProdutoPorId,
    inserirProduto,
    atualizarProduto,
    desativarProduto
} from '../service/produtos.service.js'

// =========================
// LISTAR PRODUTOS
// =========================
export const getProdutos = async (req, res) => {
    try {
        const { data, error } = await listarProdutos(true)

        if (error) {
            return res.status(500).json({ erro: error.message })
        }

        res.json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao listar produtos' })
    }
}

// =========================
// BUSCAR POR ID
// =========================
export const getProdutoById = async (req, res) => {
    try {
        const { id } = req.params

        const { data, error } = await buscarProdutoPorId(id)

        if (error || !data) {
            return res.status(404).json({ erro: 'Produto não encontrado' })
        }

        res.json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao buscar produto' })
    }
}

// =========================
// CRIAR PRODUTO
// =========================
export const createProduto = async (req, res) => {
    try {
        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({ erro: 'Apenas gestor pode criar produtos' })
        }

        const { nome, descricao, unidade } = req.body

        if (!nome || !unidade) {
            return res.status(400).json({ erro: 'Nome e unidade são obrigatórios' })
        }

        const { data, error } = await inserirProduto({ nome, descricao, unidade })

        if (error) {
            return res.status(400).json({ erro: error.message || error })
        }

        res.status(201).json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao criar produto' })
    }
}

// =========================
// ATUALIZAR PRODUTO
// =========================
export const updateProduto = async (req, res) => {
    try {
        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({ erro: 'Apenas gestor pode atualizar produtos' })
        }

        const { id } = req.params

        const { data, error } = await atualizarProduto(id, req.body)

        if (error) {
            return res.status(400).json({ erro: error.message || error })
        }

        res.json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao atualizar produto' })
    }
}

// =========================
// DESATIVAR PRODUTO
// =========================
export const deleteProduto = async (req, res) => {
    try {
        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({ erro: 'Apenas gestor pode desativar produtos' })
        }

        const { id } = req.params

        const { error } = await desativarProduto(id)

        if (error) {
            return res.status(500).json({ erro: error.message })
        }

        return res.status(200).json({ message: 'Produto desativado' })
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao desativar produto' })
    }
}