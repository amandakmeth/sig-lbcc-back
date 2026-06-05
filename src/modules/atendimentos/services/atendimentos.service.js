import supabase from '../../../config/supabase.js'

// =========================
// LISTAR ATENDIMENTOS
// =========================
export const listarAtendimentos = async () => {

    return await supabase
        .from('atendimentos')
        .select(`
            *,
            pacientes:paciente_id (
                id,
                nome
            ),
            areas:area_id (
                id,
                nome
            ),
            cotacoes:cotacao_id (
                id,
                descricao
            )
        `)
        .order('data_atendimento', {
            ascending: false
        })
}

// =========================
// BUSCAR ATENDIMENTO POR ID
// =========================
export const buscarAtendimentoPorId = async (id) => {

    return await supabase
        .from('atendimentos')
        .select(`
            *,
            pacientes:paciente_id (
                id,
                nome
            ),
            areas:area_id (
                id,
                nome
            ),
            cotacoes:cotacao_id (
                id,
                descricao
            )
        `)
        .eq('id', id)
        .single()
}

// =========================
// CRIAR ATENDIMENTO
// =========================
export const inserirAtendimento = async (dados) => {

    if (
        !dados.paciente_id ||
        !dados.tipo ||
        !dados.data_atendimento ||
        !dados.descricao
    ) {

        return {
            error: {
                message:
                    'Paciente, tipo, data e descrição são obrigatórios'
            }
        }
    }

    const { data, error } = await supabase
        .from('atendimentos')
        .insert([dados])
        .select()
        .single()

    return { data, error }
}

// =========================
// ATUALIZAR ATENDIMENTO
// =========================
export const atualizarAtendimento = async (
    id,
    dados
) => {

    if (
        !dados ||
        Object.keys(dados).length === 0
    ) {

        return {
            error: {
                message:
                    'Nenhum dado informado para atualização'
            }
        }
    }

    const dadosAtualizacao = {
        ...dados,
        updated_at: new Date()
    }

    const { data, error } = await supabase
        .from('atendimentos')
        .update(dadosAtualizacao)
        .eq('id', id)
        .select()
        .single()

    return { data, error }
}

// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
export const verificarRelacionamentosAtendimentoService =
    async (id) => {

    // Atualmente atendimento não possui
    // dependências filhas para impedir exclusão

    return {
        data: {
            possuiRelacionamentos: false,
            relacionamentos: {}
        }
    }
}

// =========================
// EXCLUIR ATENDIMENTO
// =========================
export const deletarAtendimento = async (id) => {

    const { data: atendimento } =
        await buscarAtendimentoPorId(id)

    if (!atendimento) {

        return {
            error: {
                message:
                    'Atendimento não encontrado'
            }
        }
    }

    const { data, error } = await supabase
        .from('atendimentos')
        .delete()
        .eq('id', id)
        .select()

    return { data, error }
}