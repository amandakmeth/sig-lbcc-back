import {
    listarDocumentosPorPaciente,
    inserirDocumento,
    deletarDocumento,
    buscarDocumentoPorId,
    uploadArquivo
} from '../services/paciente_documentos.service.js'

// =========================
// LISTAR DOCUMENTOS POR PACIENTE
// =========================
export const getDocumentosPorPaciente = async (req, res) => {
    try {
        const { id } = req.params

        const { data, error } = await listarDocumentosPorPaciente(id)

        if (error) {
            return res.status(500).json({ erro: error.message })
        }

        res.json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao listar documentos' })
    }
}

// =========================
// BUSCAR DOCUMENTO POR ID
// =========================
export const getDocumentoById = async (req, res) => {
    try {
        const { id } = req.params

        const { data, error } = await buscarDocumentoPorId(id)

        if (error || !data) {
            return res.status(404).json({ erro: 'Documento não encontrado' })
        }

        res.json(data)
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao buscar documento' })
    }
}

// =========================
// INSERIR DOCUMENTO (COM UPLOAD)
// =========================
export const createDocumento = async (req, res) => {
    try {
        const { id } = req.params
        const { tipo } = req.body

        //Permissão
        if (!['gestor', 'operador'].includes(req.user.perfil)) {
            return res.status(403).json({ erro: 'Sem permissão' })
        }

        //envio do arquivo é obrigatório
        if (!req.file) {
            return res.status(400).json({ erro: 'Arquivo é obrigatório' })
        }

        //upload para o storage
        const { url, error: uploadError } = await uploadArquivo(req.file, id)

        if (uploadError) {
            return res.status(500).json({ erro: 'Erro ao fazer upload do arquivo' })
        }

        //salvar no banco
        const { data, error } = await inserirDocumento({
            paciente_id: id,
            nome: req.file.originalname,
            tipo,
            url,
            tamanho: req.file.size,
            created_by: req.user.id
        })

        if (error) {
            return res.status(400).json({ erro: error.message || error })
        }

        res.status(201).json(data)
    } catch (err) {
        console.error(err)
        return res.status(500).json({ erro: 'Erro ao inserir documento' })
    }
}

// =========================
// DELETAR DOCUMENTO
// =========================
export const deleteDocumento = async (req, res) => {
    try {
        const { id } = req.params

        //Permissão
        if (!['gestor', 'operador'].includes(req.user.perfil)) {
            return res.status(403).json({ erro: 'Sem permissão' })
        }

        const { error } = await deletarDocumento(id)

        if (error) {
            return res.status(500).json({ erro: error.message })
        }

        return res.status(200).json({ message: 'Documento deletado' })
    } catch (err) {
        return res.status(500).json({ erro: 'Erro ao deletar documento' })
    }
}