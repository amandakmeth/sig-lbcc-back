import request from 'supertest'
import app from '../src/app.js'

let tokenGestor = ''
let tokenOperador = ''
let produtoId = ''

beforeAll(async () => {
    // LOGIN GESTOR
    const gestor = await request(app)
        .post('/auth/login')
        .send({
            email: 'admin@email.com',
            password: '123456'
        })

    tokenGestor = gestor.body.access_token

    // LOGIN OPERADOR
    const operador = await request(app)
        .post('/auth/login')
        .send({
            email: 'operador2@email.com',
            password: '123456'
        })

    tokenOperador = operador.body.access_token
})

describe('Produtos - Regras de Negócio', () => {

    // =========================
    // LISTAR
    // =========================
    it('deve listar produtos', async () => {
        const res = await request(app)
            .get('/produtos')
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
    })

    // =========================
    // CRIAR
    // =========================
    it('gestor deve criar produto', async () => {
        const res = await request(app)
            .post('/produtos')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                nome: `Produto ${Date.now()}`,
                descricao: 'Teste',
                unidade: 'UN'
            })

        expect(res.statusCode).toBe(201)

        const produto = res.body[0] || res.body
        expect(produto).toHaveProperty('id')

        produtoId = produto.id
    })

    it('operador NÃO pode criar produto', async () => {
        const res = await request(app)
            .post('/produtos')
            .set('Authorization', `Bearer ${tokenOperador}`)
            .send({
                nome: 'Produto inválido',
                unidade: 'UN'
            })

        expect(res.statusCode).toBe(403)
    })

    it('não deve criar produto sem nome', async () => {
        const res = await request(app)
            .post('/produtos')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                unidade: 'UN'
            })

        expect(res.statusCode).toBe(400)
    })

    it('não deve criar produto sem unidade', async () => {
        const res = await request(app)
            .post('/produtos')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                nome: 'Produto inválido'
            })

        expect(res.statusCode).toBe(400)
    })

    // =========================
    // BUSCAR POR ID
    // =========================
    it('deve buscar produto por id', async () => {
        const res = await request(app)
            .get(`/produtos/${produtoId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)
        expect(res.body).toHaveProperty('id')
    })

    it('deve retornar 404 para produto inexistente', async () => {
        const res = await request(app)
            .get('/produtos/id-invalido')
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(404)
    })

    // =========================
    // ATUALIZAR
    // =========================
    it('gestor deve atualizar produto', async () => {
        const res = await request(app)
            .put(`/produtos/${produtoId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                descricao: 'Atualizado'
            })

        expect(res.statusCode).toBe(200)
    })

    it('operador NÃO pode atualizar produto', async () => {
        const res = await request(app)
            .put(`/produtos/${produtoId}`)
            .set('Authorization', `Bearer ${tokenOperador}`)
            .send({
                descricao: 'Tentativa inválida'
            })

        expect(res.statusCode).toBe(403)
    })

    // =========================
    // DELETE (DESATIVAR)
    // =========================
    it('gestor deve desativar produto', async () => {
        const res = await request(app)
            .delete(`/produtos/${produtoId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)
    })

    it('operador NÃO pode desativar produto', async () => {
        const res = await request(app)
            .delete(`/produtos/${produtoId}`)
            .set('Authorization', `Bearer ${tokenOperador}`)

        expect(res.statusCode).toBe(403)
    })

    // =========================
    // SEM TOKEN
    // =========================
    it('não deve acessar sem token', async () => {
        const res = await request(app)
            .get('/produtos')

        expect(res.statusCode).toBe(401)
    })
})