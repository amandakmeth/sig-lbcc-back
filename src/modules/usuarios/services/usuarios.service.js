import supabase from '../../../config/supabase.js'

//LISTAR
export const listarUsuarios = async () => {
return await supabase
    .from('usuarios')
    .select('*')
}

//BUSCAR POR ID
export const buscarUsuarioPorId = async (id) => {
return await supabase
    .from('usuarios')
    .select('*')
    .eq('id', id)
    .single()
}

//CRIAR
export const inserirUsuario = async ({ nome, email, perfil }) => {
return await supabase
    .from('usuarios')
    .insert([
    {
        nome,
        email,
        perfil: perfil || 'operador'
    }
    ])
    .select()
}

//ATUALIZAR
export const atualizarUsuario = async (id, dados) => {
return await supabase
    .from('usuarios')
    .update(dados)
    .eq('id', id)
    .select()
}

//DELETAR 
export const deletarUsuario = async (id) => {
return await supabase
    .from('usuarios')
    .delete()
    .eq('id', id)
}