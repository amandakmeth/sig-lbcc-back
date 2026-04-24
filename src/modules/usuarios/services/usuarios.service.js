import supabase from '../../../config/supabase.js'
import supabaseAdmin from '../../../config/supabaseAdmin.js'

// =========================
// LISTAR USUÁRIOS
// =========================
export const listarUsuarios = async () => {
    return await supabase
        .from('usuarios')
        .select('id, nome, email, perfil, ativo, created_at')
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
// CRIAR USUÁRIO (SEGURO + DEBUG)
// =========================
export const inserirUsuario = async ({ nome, email, perfil, senha }) => {

    //console.log("INICIANDO CRIAÇÃO DE USUÁRIO:", email)
    //console.log("FUNÇÃO INSERIR USUÁRIO EXECUTOU")

    // 1. VERIFICA SE JÁ EXISTE NA TABELA
    const { data: existeTabela } = await supabase
        .from('usuarios')
        .select('id')
        .eq('email', email)
        .maybeSingle()

    if (existeTabela) {
        return { error: 'Usuário já existe no sistema (tabela)' }
    }

    // 2. CRIA NO AUTH
    const { data: authData, error: authError } =
        await supabaseAdmin.auth.admin.createUser({
            email,
            password: senha,
            email_confirm: true
        })

    if (authError || !authData?.user) {
        //console.log("ERRO AUTH:", authError)
        return { error: authError || 'Erro ao criar usuário no Auth' }
    }

    const id = authData.user.id

    //console.log("USUÁRIO CRIADO NO AUTH:", id)
    //console.log("VOU INSERIR NA TABELA USUARIOS")
    //console.log("ID:", id)
    //console.log("EMAIL:", email)

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

    //console.log("RESPOSTA DO INSERT:", data)

    // 4. ROLLBACK SE DER ERRO
    if (error) {
        //console.log("ERRO INSERT TABELA:", error)

        await supabaseAdmin.auth.admin.deleteUser(id)

        return { error }
    }

    //console.log("USUÁRIO CRIADO COM SUCESSO")

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
// DELETAR USUÁRIO
// =========================
export const deletarUsuario = async (id) => {

    const { error: authError } =
        await supabaseAdmin.auth.admin.deleteUser(id)

    if (authError) {
        return { error: authError }
    }

    const { data, error } = await supabase
        .from('usuarios')
        .delete()
        .eq('id', id)
        .select()

    return { data, error }
}