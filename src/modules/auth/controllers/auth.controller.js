import { loginUsuario } from '../services/auth.service.js'

export const login = async (req, res) => {
const { email, senha } = req.body

if (!email || !senha) {
    return res.status(400).json({ erro: 'Email e senha são obrigatórios' })
}

const { token, error } = await loginUsuario(email, senha)

if (error) {
    return res.status(401).json({ erro: error })
}

res.json({ token })
}