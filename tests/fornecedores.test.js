import request from 'supertest'
import app from '../src/app.js'

let tokenGestor = ''
let tokenOperador = ''
let fornecedorId = ''

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

describe('Fornecedores - Regras de Negócio', () => {

    // =========================
    // LISTAR
    // =========================
    it('deve listar fornecedores', async () => {

        const res = await request(app)
            .get('/fornecedores')
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
    })

    // =========================
    // CRIAR
    // =========================
    it('gestor deve criar fornecedor', async () => {

        const res = await request(app)
            .post('/fornecedores')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                razao_social: `Fornecedor ${Date.now()}`,
                nome_fantasia: 'Fornecedor Teste',
                cnpj: `${Date.now()}`,
                telefone: '43999999999',
                email: 'teste@email.com',
                cidade: 'Londrina',
                estado: 'PR'
            })

        expect(res.statusCode).toBe(201)

        const fornecedor = res.body[0] || res.body

        expect(fornecedor).toHaveProperty('id')

        fornecedorId = fornecedor.id
    })

    it('operador NÃO pode criar fornecedor', async () => {

        const res = await request(app)
            .post('/fornecedores')
            .set('Authorization', `Bearer ${tokenOperador}`)
            .send({
                razao_social: 'Fornecedor Inválido'
            })

        expect(res.statusCode).toBe(403)
    })

    it('não deve criar fornecedor sem razão social', async () => {

        const res = await request(app)
            .post('/fornecedores')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                telefone: '43999999999'
            })

        expect(res.statusCode).toBe(400)
    })

    it('não deve criar fornecedor com CNPJ duplicado', async () => {

        const cnpj = `${Date.now()}`

        await request(app)
            .post('/fornecedores')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                razao_social: 'Fornecedor 1',
                cnpj
            })

        const res = await request(app)
            .post('/fornecedores')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                razao_social: 'Fornecedor 2',
                cnpj
            })

        expect(res.statusCode).toBe(400)
    })

    // =========================
    // BUSCAR POR ID
    // =========================
    it('deve buscar fornecedor por id', async () => {

        const res = await request(app)
            .get(`/fornecedores/${fornecedorId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)

        const fornecedor = res.body[0] || res.body

        expect(fornecedor).toHaveProperty('id')
    })

    it('deve retornar 404 para fornecedor inexistente', async () => {

        const res = await request(app)
            .get('/fornecedores/id-invalido')
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(404)
    })

    // =========================
    // ATUALIZAR
    // =========================
    it('gestor deve atualizar fornecedor', async () => {

        const res = await request(app)
            .put(`/fornecedores/${fornecedorId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                telefone: '43988888888'
            })

        expect(res.statusCode).toBe(200)
    })

    it('operador NÃO pode atualizar fornecedor', async () => {

        const res = await request(app)
            .put(`/fornecedores/${fornecedorId}`)
            .set('Authorization', `Bearer ${tokenOperador}`)
            .send({
                telefone: '43977777777'
            })

        expect(res.statusCode).toBe(403)
    })

    // =========================
    // DELETE (SOFT DELETE)
    // =========================
    it('gestor deve desativar fornecedor', async () => {

        const res = await request(app)
            .delete(`/fornecedores/${fornecedorId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)
    })

    it('operador NÃO pode desativar fornecedor', async () => {

        const res = await request(app)
            .delete(`/fornecedores/${fornecedorId}`)
            .set('Authorization', `Bearer ${tokenOperador}`)

        expect(res.statusCode).toBe(403)
    })

    // =========================
    // SEM TOKEN
    // =========================
    it('não deve acessar sem token', async () => {

        const res = await request(app)
            .get('/fornecedores')

        expect(res.statusCode).toBe(401)
    })
})