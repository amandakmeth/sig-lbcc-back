import supabase from '../../../config/supabase.js'

export const authMiddleware = async (req, res, next) => {
try {
    const authHeader = req.headers.authorization

    // Verifica se o header existe
    if (!authHeader) {
    return res.status(401).json({ erro: 'Token não informado' })
    }

    // Verifica formato Bearer
    if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ erro: 'Formato do token inválido' })
    }

    const token = authHeader.split(' ')[1]

    // Valida o token no Supabase
    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user) {
    return res.status(401).json({ erro: 'Token inválido' })
    }

    // Busca o usuário na tabela do sistema
    const { data: usuario, error: userError } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', data.user.id)
    .single()

    if (userError || !usuario) {
    return res.status(401).json({ erro: 'Usuário não encontrado' })
    }

    // Injeta o usuário na requisição
    req.user = usuario

    next()
} catch (err) {
    console.error('Erro no authMiddleware:', err)
    return res.status(500).json({ erro: 'Erro interno na autenticação' })
}
}


// LOGIN
export const login = async (req, res) => {
    try {
        const { email, password } = req.body

        // CAMPOS OBRIGATÓRIOS
        if (!email && !password) {
            return res.status(400).json({
                erro: 'Email e senha são obrigatórios'
            })
        }

        if (!email) {
            return res.status(400).json({
                erro: 'Email é obrigatório'
            })
        }

        if (!password) {
            return res.status(400).json({
                erro: 'Senha é obrigatória'
            })
        }

        // VERIFICA SE O EMAIL EXISTE NO SISTEMA
        const { data: usuarioExistente } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', email)
            .single()

        if (!usuarioExistente) {
            return res.status(404).json({
                erro: 'Email não cadastrado no sistema'
            })
        }

        // LOGIN SUPABASE
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        })

        // SENHA INCORRETA
        if (error) {
            return res.status(401).json({
                erro: 'Senha incorreta'
            })
        }

        // USUÁRIO INATIVO
        if (!usuarioExistente.ativo) {
            return res.status(403).json({
                erro: 'Usuário inativo'
            })
        }

        return res.json({
            access_token: data.session.access_token,
            user: usuarioExistente
        })

    } catch (err) {
        console.error('Erro no login:', err)

        return res.status(500).json({
            erro: 'Erro ao realizar login'
        })
    }
}