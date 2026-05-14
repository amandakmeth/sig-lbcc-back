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
export const inserirUsuario = async ({ nome, email, perfil, senha }) => {

    // VERIFICA SE JÁ EXISTE
    const { data: existeTabela } = await supabase
        .from('usuarios')
        .select('id')
        .eq('email', email)
        .maybeSingle()

    if (existeTabela) {
    return {
        error: {
            message: 'Já existe um usuário cadastrado com este e-mail'
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
        return { error: authError || 'Erro ao criar usuário no Auth' }
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

    if (email || senha) {

        const updateAuth = {}

        if (email) updateAuth.email = email
        if (senha) updateAuth.password = senha

        const { error: authError } =
            await supabaseAdmin.auth.admin.updateUserById(id, updateAuth)

        if (authError) {
            return { error: authError }
        }
    }

    return { data }
}

// =========================
// DESATIVAR USUÁRIO (SOFT DELETE)
// =========================
export const deletarUsuario = async (id) => {

    const { data, error } = await supabase
        .from('usuarios')
        .update({ ativo: false })
        .eq('id', id)
        .select()

    return { data, error }
}