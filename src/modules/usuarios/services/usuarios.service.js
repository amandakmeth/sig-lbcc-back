import supabase from '../../../config/supabase.js'
import supabaseAdmin from '../../../config/supabaseAdmin.js'

// =========================
// LISTAR USUÁRIOS
// =========================
export const listarUsuarios = async () => {
    return await supabase
        .from('usuarios')
        .select('id, nome, email, perfil, ativo, created_at')
        .order('nome', { ascending: true })
}

// =========================
// BUSCAR POR ID
// =========================
export const buscarUsuarioPorId = async (id) => {
    return await supabase
        .from('usuarios')
        .select('id, nome, email, perfil, ativo, created_at')
        .eq('id', id)
        .single()
}

// =========================
// CRIAR USUÁRIO
// =========================
export const inserirUsuario = async ({
    nome,
    email,
    perfil,
    senha
}) => {

    // VERIFICA SE JÁ EXISTE
    const { data: existeTabela } = await supabase
        .from('usuarios')
        .select('id')
        .eq('email', email)
        .maybeSingle()

    if (existeTabela) {
        return {
            error: {
                message:
                    'Já existe um usuário cadastrado com este e-mail'
            }
        }
    }

    // CRIA NO AUTH
    const { data: authData, error: authError } =
        await supabaseAdmin.auth.admin.createUser({
            email,
            password: senha,
            email_confirm: true
        })

    if (authError || !authData?.user) {
        return {
            error:
                authError || 'Erro ao criar usuário no Auth'
        }
    }

    const id = authData.user.id

    // INSERE NA TABELA
    const { data, error } = await supabase
        .from('usuarios')
        .upsert([
            {
                id,
                nome,
                email,
                perfil: perfil || 'operador',
                ativo: true
            }
        ])
        .select()

    // ROLLBACK
    if (error) {
        await supabaseAdmin.auth.admin.deleteUser(id)
        return { error }
    }

    return { data }
}

// =========================
// ATUALIZAR USUÁRIO
// =========================
export const atualizarUsuario = async (id, dados) => {

    const { email, senha, ...resto } = dados

    const { data, error } = await supabase
        .from('usuarios')
        .update(resto)
        .eq('id', id)
        .select()

    if (error) {
        return { error }
    }

    // ATUALIZA AUTH
    if (email || senha) {

        const updateAuth = {}

        if (email) updateAuth.email = email
        if (senha) updateAuth.password = senha

        const { error: authError } =
            await supabaseAdmin.auth.admin
                .updateUserById(id, updateAuth)

        if (authError) {
            return { error: authError }
        }
    }

    return { data }
}

// =========================
// ATIVAR / INATIVAR USUÁRIO
// =========================
export const alterarStatusUsuario = async (id) => {

    // 1. buscar usuário atual
    const { data: usuario, error: errorFind } = await supabase
        .from('usuarios')
        .select('ativo')
        .eq('id', id)
        .single()

    if (errorFind) {
        return { data: null, error: errorFind }
    }

    // 2. inverter status
    const novoStatus = !usuario.ativo

    // 3. atualizar no banco
    const { data, error } = await supabase
        .from('usuarios')
        .update({
            ativo: novoStatus,
            updated_at: new Date()
        })
        .eq('id', id)
        .select()

    return { data, error }
}

// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
export const verificarRelacionamentosUsuarioService =
    async (id) => {

    // PACIENTES CREATED_BY
    const {
        count: pacientesCreated,
        error: error1
    } = await supabase
        .from('pacientes')
        .select('*', {
            count: 'exact',
            head: true
        })
        .eq('created_by', id)

    if (error1) {
        return { error: error1 }
    }

    // PACIENTES UPDATED_BY
    const {
        count: pacientesUpdated,
        error: error2
    } = await supabase
        .from('pacientes')
        .select('*', {
            count: 'exact',
            head: true
        })
        .eq('updated_by', id)

    if (error2) {
        return { error: error2 }
    }

    // DOCUMENTOS
    const {
        count: documentos,
        error: error3
    } = await supabase
        .from('paciente_documentos')
        .select('*', {
            count: 'exact',
            head: true
        })
        .eq('created_by', id)

    if (error3) {
        return { error: error3 }
    }

    const possuiRelacionamentos =
        (pacientesCreated || 0) > 0 ||
        (pacientesUpdated || 0) > 0 ||
        (documentos || 0) > 0

    return {
        data: {
            possuiRelacionamentos,
            relacionamentos: {
                pacientesCreated: pacientesCreated || 0,
                pacientesUpdated: pacientesUpdated || 0,
                documentos: documentos || 0
            }
        }
    }
}

// =========================
// EXCLUIR USUÁRIO
// =========================
export const deletarUsuario = async (id) => {

    // REMOVE DA TABELA
    const { data, error } = await supabase
        .from('usuarios')
        .delete()
        .eq('id', id)
        .select()

    if (error) {
        return { error }
    }

    // REMOVE DO AUTH
    const { error: authError } =
        await supabaseAdmin.auth.admin
            .deleteUser(id)

    if (authError) {
        return { error: authError }
    }

    return { data }
}