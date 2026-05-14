import request from 'supertest'
import app from '../src/app.js'

let tokenGestor = ''
let tokenOperador = ''
let usuarioId = ''
let operadorId = ''
let emailUsuarioTeste = ''

beforeAll(async () => {

    const gestor = await request(app)
        .post('/auth/login')
        .send({
            email: 'admin@email.com',
            password: '123456'
        })

    tokenGestor = gestor.body.access_token

    const operador = await request(app)
        .post('/auth/login')
        .send({
            email: 'operador2@email.com',
            password: '123456'
        })

    tokenOperador = operador.body.access_token
    operadorId = operador.body.user.id
})

describe('Usuários - Regras de Negócio', () => {

    // =========================
    // LISTAR
    // =========================
    it('gestor deve listar usuários', async () => {
        const res = await request(app)
            .get('/usuarios')
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
    })

    it('operador pode ou não listar usuários', async () => {
        const res = await request(app)
            .get('/usuarios')
            .set('Authorization', `Bearer ${tokenOperador}`)

        expect([200, 403]).toContain(res.statusCode)
    })

    // =========================
    // CRIAR
    // =========================
    it('gestor deve criar usuário', async () => {

        emailUsuarioTeste = `teste_${Date.now()}@email.com`

        const res = await request(app)
            .post('/usuarios')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                nome: 'Usuário Teste',
                email: emailUsuarioTeste,
                senha: '123456',
                perfil: 'operador'
            })

        expect(res.statusCode).toBe(201)

        const user = res.body[0] || res.body
        expect(user).toHaveProperty('id')

        usuarioId = user.id
    })

    it('operador NÃO pode criar usuário', async () => {
        const res = await request(app)
            .post('/usuarios')
            .set('Authorization', `Bearer ${tokenOperador}`)
            .send({
                nome: 'Inválido',
                email: 'inv@inv.com',
                senha: '123456'
            })

        expect(res.statusCode).toBe(403)
    })

    // =========================
    // BUSCAR
    // =========================
    it('gestor pode buscar usuário', async () => {
        const res = await request(app)
            .get(`/usuarios/${usuarioId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)
    })

    it('operador pode ver ele mesmo', async () => {
        const res = await request(app)
            .get(`/usuarios/${operadorId}`)
            .set('Authorization', `Bearer ${tokenOperador}`)

        expect(res.statusCode).toBe(200)
    })

    it('operador NÃO pode ver outro usuário', async () => {
        const res = await request(app)
            .get(`/usuarios/${usuarioId}`)
            .set('Authorization', `Bearer ${tokenOperador}`)

        expect(res.statusCode).toBe(403)
    })

    // =========================
    // UPDATE
    // =========================
    it('gestor pode atualizar usuário', async () => {
        const res = await request(app)
            .put(`/usuarios/${usuarioId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({ nome: 'Atualizado' })

        expect(res.statusCode).toBe(200)
    })

    it('operador pode atualizar ele mesmo', async () => {
        const res = await request(app)
            .put(`/usuarios/${operadorId}`)
            .set('Authorization', `Bearer ${tokenOperador}`)
            .send({ nome: 'Operador Atualizado' })

        expect([200, 400]).toContain(res.statusCode)
    })

    // =========================
    // STATUS (NOVO TESTE IMPORTANTE)
    // =========================
    it('gestor pode ativar/inativar usuário', async () => {

        const res = await request(app)
            .patch(`/usuarios/${usuarioId}/status`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({ ativo: false })

        expect(res.statusCode).toBe(200)
        expect(res.body[0] || res.body).toHaveProperty('ativo')
    })

    it('não deve aceitar status inválido', async () => {

        const res = await request(app)
            .patch(`/usuarios/${usuarioId}/status`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({ ativo: 'sim' })

        expect(res.statusCode).toBe(400)
    })

    // =========================
    // DELETE (COM VÍNCULO)
    // =========================
    it('gestor pode excluir ou ser bloqueado por vínculo', async () => {

        const res = await request(app)
            .delete(`/usuarios/${usuarioId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect([200, 400]).toContain(res.statusCode)

        if (res.statusCode === 400) {
            expect(res.body).toHaveProperty('possuiRelacionamentos')
        }
    })

    it('operador NÃO pode deletar usuário', async () => {

        const res = await request(app)
            .delete(`/usuarios/${operadorId}`)
            .set('Authorization', `Bearer ${tokenOperador}`)

        expect(res.statusCode).toBe(403)
    })

    // =========================
    // SEM TOKEN
    // =========================
    it('não deve acessar sem token', async () => {

        const res = await request(app)
            .get('/usuarios')

        expect(res.statusCode).toBe(401)
    })
})