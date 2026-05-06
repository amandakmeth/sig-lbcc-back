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

    it('deve listar áreas (autenticado)', async () => {
        const res = await request(app)
            .get('/areas')
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
    })

    it('gestor deve criar área', async () => {
        const res = await request(app)
            .post('/areas')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                nome: `Área ${Date.now()}`,
                descricao: 'Teste'
            })

        expect(res.statusCode).toBe(201)

        const area = res.body[0] || res.body
        areaId = area.id
    })

    it('operador NÃO pode criar área', async () => {
        const res = await request(app)
            .post('/areas')
            .set('Authorization', `Bearer ${tokenOperador}`)
            .send({ nome: 'Área inválida' })

        expect(res.statusCode).toBe(403)
    })

    it('não deve criar área sem nome', async () => {
        const res = await request(app)
            .post('/areas')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({})

        expect(res.statusCode).toBe(400)
    })

    it('deve buscar área por id', async () => {
        const res = await request(app)
            .get(`/areas/${areaId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)
    })

    it('deve retornar 404 para área inexistente', async () => {
        const res = await request(app)
            .get('/areas/uuid-invalido')
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(404)
    })

    it('gestor deve atualizar área', async () => {
        const res = await request(app)
            .put(`/areas/${areaId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({ descricao: 'Atualizada' })

        expect(res.statusCode).toBe(200)
    })

    it('operador NÃO pode atualizar área', async () => {
        const res = await request(app)
            .put(`/areas/${areaId}`)
            .set('Authorization', `Bearer ${tokenOperador}`)
            .send({ descricao: 'Tentativa inválida' })

        expect(res.statusCode).toBe(403)
    })

    it('gestor deve desativar área', async () => {
        const res = await request(app)
            .delete(`/areas/${areaId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)
    })

    it('operador NÃO pode desativar área', async () => {
        const res = await request(app)
            .delete(`/areas/${areaId}`)
            .set('Authorization', `Bearer ${tokenOperador}`)

        expect(res.statusCode).toBe(403)
    })

    it('não deve acessar sem token', async () => {
        const res = await request(app)
            .get('/areas')

        expect(res.statusCode).toBe(401)
    })
})