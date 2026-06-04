import express from 'express'
import { login } from '../controllers/auth.controller.js'

const router = express.Router()

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Realiza login do usuário
 *     tags: [Auth]
 *     description: Recebe email e senha e retorna o token JWT do Supabase
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: usuario@email.com
 *               password:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *         content:
 *           application/json:
 *             example:
 *               access_token: "jwt_token_aqui"
 *               user:
 *                 id: "uuid"
 *                 email: "usuario@email.com"
 *       401:
 *         description: Credenciais inválidas
 *       400:
 *         description: Email e senha são obrigatórios
 */
router.post('/login', login)

export default router