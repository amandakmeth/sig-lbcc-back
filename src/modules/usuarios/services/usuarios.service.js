import supabase from '../../../config/supabase.js'
import bcrypt from 'bcrypt'

// LISTAR
export const listarUsuarios = async () => {
    return await supabase
        .from('usuarios')
        .select('id, nome, email, perfil, ativo, created_at')
}

// BUSCAR POR ID
export const buscarUsuarioPorId = async (id) => {
    return await supabase
        .from('usuarios')
        .select('id, nome, email, perfil, ativo, created_at')
        .eq('id', id)
        .single()
}

// CRIAR
export const inserirUsuario = async ({ nome, email, perfil, senha }) => {
    const senhaHash = await bcrypt.hash(senha, 10)

return await supabase
    .from('usuarios')
    .insert([
    {
        nome,
        email,
        perfil: perfil || 'operador',
        senha: senhaHash
    }
    ])
    .select('id, nome, email, perfil, ativo, created_at')
}

// ATUALIZAR
export const atualizarUsuario = async (id, dados) => {

if (dados.senha) {
    dados.senha = await bcrypt.hash(dados.senha, 10)
}

return await supabase
    .from('usuarios')
    .update(dados)
    .eq('id', id)
    .select('id, nome, email, perfil, ativo, created_at')
}

// DELETAR
export const deletarUsuario = async (id) => {
    return await supabase
        .from('usuarios')
        .delete()
        .eq('id', id)
}