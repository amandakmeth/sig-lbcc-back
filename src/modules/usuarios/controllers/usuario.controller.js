import supabase from '../../../services/supabase.js'

//LISTAR
export const getUsuarios = async (req, res) => {
const { data, error } = await supabase
    .from('usuarios')
    .select('*')

if (error) {
    console.error('Erro ao buscar usuários:', error)
    return res.status(500).json({ erro: error.message })
}

res.json(data)
}

//CRIAR
export const createUsuario = async (req, res) => {
const { nome, email, perfil } = req.body

const { data, error } = await supabase
    .from('usuarios')
    .insert([
    {
        nome,
        email,
        perfil: perfil || 'operador'
    }
    ])
    .select()

if (error) {
    console.error('Erro ao criar usuário:', error)
    return res.status(500).json({ erro: error.message })
}

res.status(201).json(data)
}