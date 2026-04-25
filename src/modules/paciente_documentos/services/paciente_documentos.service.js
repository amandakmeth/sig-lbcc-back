import supabase from '../../../config/supabase.js'
import supabaseAdmin from '../../../config/supabaseAdmin.js'
import { buscarPacientePorId } from '../../pacientes/service/pacientes.service.js'

// =========================
// LISTAR DOCUMENTOS POR PACIENTE
// =========================
export const listarDocumentosPorPaciente = async (paciente_id) => {
    return await supabase
        .from('paciente_documentos')
        .select('*')
        .eq('paciente_id', paciente_id)
        .order('created_at', { ascending: false })
}

// =========================
// BUSCAR DOCUMENTO POR ID
// =========================
export const buscarDocumentoPorId = async (id) => {
    return await supabase
        .from('paciente_documentos')
        .select('*')
        .eq('id', id)
        .single()
}

// =========================
// 📤 UPLOAD ARQUIVO PARA STORAGE (CORRIGIDO)
// =========================
export const uploadArquivo = async (file, paciente_id) => {
    try {
        const fileName = `${paciente_id}/${Date.now()}-${file.originalname}`

        const { error } = await supabaseAdmin.storage
            .from('pacientes-documentos')
            .upload(fileName, file.buffer, {
                contentType: file.mimetype
            })

        if (error) {
            console.error('ERRO UPLOAD:', error)
            return { error }
        }

        const { data } = supabaseAdmin.storage
            .from('pacientes-documentos')
            .getPublicUrl(fileName)

        return { url: data.publicUrl }

    } catch (err) {
        console.error('ERRO GERAL UPLOAD:', err)
        return { error: err }
    }
}

// =========================
// INSERIR DOCUMENTO (COM VALIDAÇÃO)
// =========================
export const inserirDocumento = async ({
    paciente_id,
    nome,
    tipo,
    url,
    tamanho,
    created_by
}) => {

    // 🔎 valida paciente
    const { data: paciente, error: pacienteError } =
        await buscarPacientePorId(paciente_id)

    if (pacienteError || !paciente) {
        return { error: { message: 'Paciente não encontrado' } }
    }

    const { data, error } = await supabase
        .from('paciente_documentos')
        .insert([
            {
                paciente_id,
                nome,
                tipo,
                url,
                tamanho,
                created_by
            }
        ])
        .select()

    return { data, error }
}

// =========================
// DELETAR DOCUMENTO
// =========================
export const deletarDocumento = async (id) => {
    const { data, error } = await supabase
        .from('paciente_documentos')
        .delete()
        .eq('id', id)
        .select()

    return { data, error }
}