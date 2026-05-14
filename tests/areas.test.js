import request from 'supertest'
import app from '../src/app.js'
import { getTokens } from './helpers/auth.js'

let tokenGestor = ''
let tokenOperador = ''
let areaId = ''

beforeAll(async () => {
    const tokens = await getTokens()

    tokenGestor = tokens.gestor
    tokenOperador = tokens.operador
})

describe('Áreas - Regras de Negócio', () => {

    // =========================
    // LISTAR
    // =========================
    it('deve listar áreas (autenticado)', async () => {
        const res = await request(app)
            .get('/areas')
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
    })

    // =========================
    // CRIAR
    // =========================
    it('gestor deve criar área', async () => {
        const res = await request(app)
            .post('/areas')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                nome: `Área Teste ${Date.now()}`,
                descricao: 'Teste de criação'
            })

        expect(res.statusCode).toBe(201)

        const area = res.body[0] || res.body
        expect(area).toHaveProperty('id')

        areaId = area.id
    })

    it('operador NÃO pode criar área', async () => {
        const res = await request(app)
            .post('/areas')
            .set('Authorization', `Bearer ${tokenOperador}`)
            .send({
                nome: 'Área inválida'
            })

        expect(res.statusCode).toBe(403)
    })

    it('não deve criar área sem nome', async () => {
        const res = await request(app)
            .post('/areas')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({})

        expect(res.statusCode).toBe(400)
    })

    // =========================
    // BUSCAR POR ID
    // =========================
    it('deve buscar área por id', async () => {
        const res = await request(app)
            .get(`/areas/${areaId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)

        const area = res.body[0] || res.body
        expect(area).toHaveProperty('id')
    })

    it('deve retornar 404 para área inexistente', async () => {
        const res = await request(app)
            .get('/areas/uuid-invalido')
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(404)
    })

    // =========================
    // ATUALIZAR
    // =========================
    it('gestor deve atualizar área', async () => {
        const res = await request(app)
            .put(`/areas/${areaId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                descricao: 'Descrição atualizada'
            })

        expect(res.statusCode).toBe(200)
    })

    it('operador NÃO pode atualizar área', async () => {
        const res = await request(app)
            .put(`/areas/${areaId}`)
            .set('Authorization', `Bearer ${tokenOperador}`)
            .send({
                descricao: 'Tentativa inválida'
            })

        expect(res.statusCode).toBe(403)
    })

    // =========================
    // EXCLUSÃO (COM REGRA DE VÍNCULO)
    // =========================
    it('operador NÃO pode excluir área', async () => {
        const res = await request(app)
            .delete(`/areas/${areaId}`)
            .set('Authorization', `Bearer ${tokenOperador}`)

        expect(res.statusCode).toBe(403)
    })

    it('gestor pode excluir área ou receber bloqueio por vínculo', async () => {
        const res = await request(app)
            .delete(`/areas/${areaId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)

        // aceita os dois comportamentos válidos do sistema
        expect([200, 400]).toContain(res.statusCode)

        if (res.statusCode === 400) {
            expect(res.body).toHaveProperty('erro')
            expect(res.body).toHaveProperty('possuiRelacionamentos')
            expect(res.body.relacionamentos).toBeDefined()
        }
    })

    // =========================
    // SEM TOKEN
    // =========================
    it('não deve acessar sem token', async () => {
        const res = await request(app)
            .get('/areas')

        expect(res.statusCode).toBe(401)
    })
})