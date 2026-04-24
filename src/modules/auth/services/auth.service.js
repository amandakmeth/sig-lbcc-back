/*import supabase from '../../../config/supabase.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

export const loginUsuario = async (email, senha) => {

const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('email', email)
    .single()

if (error || !usuario) {
    return { error: 'Usuário não encontrado' }
}

const senhaValida = await bcrypt.compare(senha, usuario.senha)

if (!senhaValida) {
    return { error: 'Senha inválida' }
}

const token = jwt.sign(
    { id: usuario.id, email: usuario.email },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
)

return { token }
}*/