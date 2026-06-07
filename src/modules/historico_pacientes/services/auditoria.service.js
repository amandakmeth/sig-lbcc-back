import { inserirHistorico } from './historico.service.js'

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