import supabase from '../../../config/supabase.js'

export const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization

        if (!authHeader) {
        return res.status(401).json({ erro: 'Token não informado' })
        }

        if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ erro: 'Formato do token inválido' })
        }

        const token = authHeader.split(' ')[1]

        // 🔐 valida token no Supabase
        const { data, error } = await supabase.auth.getUser(token)

        if (error || !data.user) {
        console.error('Erro ao validar token:', error)
        return res.status(401).json({ erro: 'Token inválido' })
        }

        // 🔎 busca usuário na tabela do sistema
        const { data: usuario, error: userError } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', data.user.id)
        .single()

        if (userError || !usuario) {
        return res.status(401).json({ erro: 'Usuário não encontrado' })
        }

        // injeta no request
        req.user = usuario

        next()
    } catch (err) {
        console.error('Erro no authMiddleware:', err)
        return res.status(500).json({ erro: 'Erro interno na autenticação' })
    }
}