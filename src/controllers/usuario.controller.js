import supabase from '../services/supabase.js'

export const getUsuarios = async (req, res) => {
const { data, error } = await supabase
    .from('usuarios')
    .select('*')

if (error) return res.status(500).json(error)

res.json(data)
}

export const createUsuario = async (req, res) => {
const { nome, email } = req.body

const { data, error } = await supabase
    .from('usuarios')
    .insert([{ nome, email }])

if (error) return res.status(500).json(error)

res.json(data)
}