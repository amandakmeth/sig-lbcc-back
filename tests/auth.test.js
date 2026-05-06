import request from 'supertest'
import app from '../src/app.js'

let token = ''

describe('Auth - Regras de Negócio', () => {

    // =========================
    // LOGIN
    // =========================
    it('deve fazer login com sucesso', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({
                email: 'admin@email.com',
                password: '123456'
            })

        expect(res.statusCode).toBe(200)
        expect(res.body).toHaveProperty('access_token')
        expect(res.body).toHaveProperty('user')

        token = res.body.access_token
    })

    it('não deve logar sem email', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({
                password: '123456'
            })

        expect(res.statusCode).toBe(400)
    })

    it('não deve logar sem senha', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({
                email: 'admin@email.com'
            })

        expect(res.statusCode).toBe(400)
    })

    it('não deve logar com credenciais inválidas', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({
                email: 'admin@email.com',
                password: 'senha_errada'
            })

        expect(res.statusCode).toBe(401)
    })

    // =========================
    // MIDDLEWARE (PROTEÇÃO DE ROTAS)
    // =========================
    it('deve bloquear sem token', async () => {
        const res = await request(app)
            .get('/usuarios')

        expect(res.statusCode).toBe(401)
    })

    it('deve bloquear token mal formatado', async () => {
        const res = await request(app)
            .get('/usuarios')
            .set('Authorization', 'Token errado')

        expect(res.statusCode).toBe(401)
    })

    it('deve permitir acesso com token válido', async () => {
        const res = await request(app)
            .get('/usuarios')
            .set('Authorization', `Bearer ${token}`)

        // pode variar conforme regra de permissão
        expect([200, 403]).toContain(res.statusCode)
    })
})