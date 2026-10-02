import { inserirHistorico } from './historico.service.js'
import supabase from '../../../config/supabase.js'

export const registrarOcorrencia = async ({
    paciente_id,
    usuario_id,
    tipo_evento,
    descricao,
    referencia_id = null
}) => {

    return await inserirHistorico({
        paciente_id,
        usuario_id,
        tipo_evento,
        descricao,
        referencia_id
    })
}

export const registrarAuditoria = async ({
    entidade_tipo,
    entidade_id = null,
    acao,
    usuario_id = null,
    dados = {}
}) => {
    return await supabase
        .from('auditoria_eventos')
        .insert([{
            entidade_tipo,
            entidade_id,
            acao,
            usuario_id,
            dados
        }])
        .select()
        .single()
}
