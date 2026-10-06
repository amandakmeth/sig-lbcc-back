import { inserirHistorico } from './historico.service.js'
import supabase from '../../../config/supabase.js'

export const registrarOcorrencia = async ({
    paciente_id,
    usuario_id,
    tipo_evento,
    descricao,
    referencia_id = null,
    idempotency_key = null
}) => {

    return await inserirHistorico({
        paciente_id,
        usuario_id,
        tipo_evento,
        descricao,
        referencia_id,
        idempotency_key
    })
}

export const registrarAuditoria = async ({
    entidade_tipo,
    entidade_id = null,
    acao,
    usuario_id = null,
    dados = {},
    idempotency_key = null
}) => {
    const registro = {
            entidade_tipo,
            entidade_id,
            acao,
            usuario_id,
            dados,
            ...(idempotency_key ? { idempotency_key } : {})
        }
    const query = supabase.from('auditoria_eventos')

    return await (idempotency_key
        ? query.upsert([registro], {
            onConflict: 'idempotency_key',
            ignoreDuplicates: true
        })
        : query.insert([registro]))
        .select()
        .maybeSingle()
}
