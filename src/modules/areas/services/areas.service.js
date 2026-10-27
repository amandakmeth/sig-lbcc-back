import supabase from '../../../config/supabase.js'

// =========================
// LISTAR ÁREAS (APENAS ATIVAS)
// =========================
export const listarAreas = async (ativo = true) => {

    return await supabase
        .from('areas')
        .select('*')
        .eq('ativo', ativo)
        .order('nome', { ascending: true })
}

// =========================
// BUSCAR ÁREA POR ID
// =========================
export const buscarAreaPorId = async (id) => {

    return await supabase
        .from('areas')
        .select('*')
        .eq('id', id)
        .single()
}

// =========================
// CRIAR ÁREA
// =========================

export const inserirArea = async ({
    nome,
    descricao,
    tipo_ordem = 'OF'
}) => {

    // VALIDAR TIPO DE ORDEM
    const tiposPermitidos = ['OF', 'OT', 'AMBOS']

    if (!tiposPermitidos.includes(tipo_ordem)) {
        return {
            error: {
                message: 'Tipo de ordem inválido. Utilize OF, OT ou AMBOS'
            }
        }
    }

    // VERIFICAR DUPLICIDADE
    const { data: existe, error: erroBusca } = await supabase
        .from('areas')
        .select('id')
        .eq('nome', nome)
        .maybeSingle()

    if (erroBusca) {
        return { data: null, error: erroBusca }
    }

    if (existe) {
        return {
            error: {
                message: 'Área já cadastrada'
            }
        }
    }

    const { data, error } = await supabase
        .from('areas')
        .insert([{
            nome,
            descricao,
            tipo_ordem
        }])
        .select()

    return { data, error }
}


// =========================
// ATUALIZAR ÁREA
// =========================
export const atualizarArea = async (
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

    
    // VALIDAR TIPO DE ORDEM, SE INFORMADO
    const tiposPermitidos = ['OF', 'OT', 'AMBOS']

    if (
        dados.tipo_ordem !== undefined &&
        !tiposPermitidos.includes(dados.tipo_ordem)
    ) {
        return {
            error: {
                message: 'Tipo de ordem inválido. Utilize OF, OT ou AMBOS'
            }
        }
    }


    // VERIFICA DUPLICIDADE DE NOME
    if (dados.nome) {

        const { data: existe } = await supabase
            .from('areas')
            .select('id')
            .eq('nome', dados.nome)
            .neq('id', id)
            .maybeSingle()

        if (existe) {

            return {
                error: {
                    message:
                        'Já existe uma área com este nome'
                }
            }
        }
    }

    const { data, error } = await supabase
        .from('areas')
        .update({
            ...dados,
            updated_at: new Date()
        })
        .eq('id', id)
        .select()

    return { data, error }
}

// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
export const verificarRelacionamentosAreaService =
    async (id) => {

    // Atualmente a tabela areas
    // não possui relacionamentos

    return {
        data: {
            possuiRelacionamentos: false,
            relacionamentos: {}
        }
    }
}

// =========================
// EXCLUIR ÁREA
// =========================
export const deletarArea = async (id) => {

    const { data, error } = await supabase
        .from('areas')
        .delete()
        .eq('id', id)
        .select()

    return { data, error }
}