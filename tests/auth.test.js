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
        expect(res.body.erro).toBe('Email é obrigatório')
    })

    it('não deve logar sem senha', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({
                email: 'admin@email.com'
            })

        expect(res.statusCode).toBe(400)
        expect(res.body.erro).toBe('Senha é obrigatória')
    })

    it('não deve logar sem email e senha', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({})

        expect(res.statusCode).toBe(400)
        expect(res.body.erro).toBe('Email e senha são obrigatórios')
    })

    it('não deve logar com email inexistente', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({
                email: 'naoexiste@email.com',
                password: '123456'
            })

        expect(res.statusCode).toBe(404)
        expect(res.body.erro).toBe('Email não cadastrado no sistema')
    })

    it('não deve logar com senha incorreta', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({
                email: 'admin@email.com',
                password: 'senha_errada'
            })

        expect(res.statusCode).toBe(401)
        expect(res.body.erro).toBe('Senha incorreta')
    })

    // =========================
    // MIDDLEWARE
    // =========================
    it('deve bloquear sem token', async () => {
        const res = await request(app)
            .get('/usuarios')

        expect(res.statusCode).toBe(401)
        expect(res.body.erro).toBe('Token não informado')
    })

    it('deve bloquear token mal formatado', async () => {
        const res = await request(app)
            .get('/usuarios')
            .set('Authorization', 'Token errado')

        expect(res.statusCode).toBe(401)
        expect(res.body.erro).toBe('Formato do token inválido')
    })

    it('deve permitir acesso com token válido', async () => {
        const res = await request(app)
            .get('/usuarios')
            .set('Authorization', `Bearer ${token}`)

        expect([200, 403]).toContain(res.statusCode)
    })
})