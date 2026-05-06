import request from 'supertest'
import app from '../src/app.js'

let tokenGestor = ''
let tokenOperador = ''
let pacienteId = ''

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

describe('Pacientes - Regras de Negócio', () => {

    // =========================
    // CRIAR
    // =========================
    it('deve criar paciente (gestor)', async () => {
        const res = await request(app)
            .post('/pacientes')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                nome: `Paciente ${Date.now()}`,
                data_nascimento: '2000-01-01',
                cidade: 'Londrina',
                estado: 'PR'
            })

        expect(res.statusCode).toBe(201)

        const paciente = res.body[0] || res.body

        expect(paciente).toHaveProperty('id')

        pacienteId = paciente.id
    })

    it('não deve criar paciente sem nome', async () => {
        const res = await request(app)
            .post('/pacientes')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                data_nascimento: '2000-01-01'
            })

        expect(res.statusCode).toBe(400)
    })

    it('não deve criar paciente sem data de nascimento', async () => {
        const res = await request(app)
            .post('/pacientes')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                nome: 'Paciente sem data'
            })

        expect(res.statusCode).toBe(400)
    })

    // =========================
    // LISTAR
    // =========================
    it('deve listar pacientes', async () => {
        const res = await request(app)
            .get('/pacientes')
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
    })

    // =========================
    // BUSCAR POR ID
    // =========================
    it('deve buscar paciente por id', async () => {
        const res = await request(app)
            .get(`/pacientes/${pacienteId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)

        const paciente = res.body[0] || res.body

        expect(paciente).toHaveProperty('id')
    })

    it('deve retornar 404 para paciente inexistente', async () => {
        const res = await request(app)
            .get('/pacientes/uuid-invalido')
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(404)
    })

    // =========================
    // ATUALIZAR
    // =========================
    it('deve atualizar paciente', async () => {
        const res = await request(app)
            .put(`/pacientes/${pacienteId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                cidade: 'Curitiba'
            })

        expect(res.statusCode).toBe(200)
    })

    // =========================
    // DELETAR (INATIVAR)
    // =========================
    it('deve inativar paciente', async () => {
        const res = await request(app)
            .delete(`/pacientes/${pacienteId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)
    })

    // =========================
    // SEM TOKEN
    // =========================
    it('não deve acessar sem token', async () => {
        const res = await request(app)
            .get('/pacientes')

        expect(res.statusCode).toBe(401)
    })
})