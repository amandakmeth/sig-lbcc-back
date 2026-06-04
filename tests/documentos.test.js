import request from 'supertest'
import app from '../src/app.js'
import path from 'path'
import { jest } from '@jest/globals'


jest.setTimeout(20000)

let tokenGestor = ''
let tokenOperador = ''
let pacienteId = ''
let documentoId = ''

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

    // CRIA PACIENTE
    const paciente = await request(app)
        .post('/pacientes')
        .set('Authorization', `Bearer ${tokenGestor}`)
        .send({
            nome: 'Paciente Teste',
            data_nascimento: '2000-01-01'
        })

    const pacienteData = paciente.body[0] || paciente.body
    pacienteId = pacienteData.id
})

describe('Documentos - Regras de Negócio', () => {

    // =========================
    // UPLOAD
    // =========================
    it('deve fazer upload de documento (gestor)', async () => {
        const res = await request(app)
            .post(`/pacientes/${pacienteId}/documentos`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .field('tipo', 'pdf')
            .attach('file', path.resolve('tests/files/test.pdf'))

        expect(res.statusCode).toBe(201)

        const doc = res.body[0] || res.body
        expect(doc).toHaveProperty('id')

        documentoId = doc.id
    })

    it('deve fazer upload com operador', async () => {
        const res = await request(app)
            .post(`/pacientes/${pacienteId}/documentos`)
            .set('Authorization', `Bearer ${tokenOperador}`)
            .field('tipo', 'pdf')
            .attach('file', path.resolve('tests/files/test.pdf'))

        expect(res.statusCode).toBe(201)
    })

    it('não deve fazer upload sem arquivo', async () => {
        const res = await request(app)
            .post(`/pacientes/${pacienteId}/documentos`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .field('tipo', 'pdf')

        expect(res.statusCode).toBe(400)
    })

    it('não deve permitir upload para paciente inativo', async () => {

        // cria paciente
        const paciente = await request(app)
            .post('/pacientes')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                nome: 'Paciente Inativo',
                data_nascimento: '2000-01-01'
            })

        const pacienteData = paciente.body[0] || paciente.body
        const pacienteInativoId = pacienteData.id

        // inativa paciente
        await request(app)
            .delete(`/pacientes/${pacienteInativoId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)

        // tenta upload
        const res = await request(app)
            .post(`/pacientes/${pacienteInativoId}/documentos`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .field('tipo', 'pdf')
            .attach('file', path.resolve('tests/files/test.pdf'))

        expect(res.statusCode).toBe(400)
    })

    // =========================
    // LISTAR
    // =========================
    it('deve listar documentos por paciente', async () => {
        const res = await request(app)
            .get(`/pacientes/${pacienteId}/documentos`)
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
    })

    // =========================
    // BUSCAR POR ID
    // =========================
    it('deve buscar documento por id', async () => {
        const res = await request(app)
            .get(`/documentos/${documentoId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)

        const doc = res.body[0] || res.body
        expect(doc).toHaveProperty('id')
    })

    it('deve retornar 404 para documento inexistente', async () => {
        const res = await request(app)
            .get('/documentos/uuid-invalido')
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(404)
    })

    // =========================
    // DELETE
    // =========================
    it('deve deletar documento (gestor)', async () => {
        const res = await request(app)
            .delete(`/documentos/${documentoId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)

        expect(res.statusCode).toBe(200)
    })

    it('operador deve deletar documento', async () => {

        // cria novo documento
        const create = await request(app)
            .post(`/pacientes/${pacienteId}/documentos`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .field('tipo', 'pdf')
            .attach('file', path.resolve('tests/files/test.pdf'))

        const doc = create.body[0] || create.body
        const id = doc.id

        // operador deleta
        const res = await request(app)
            .delete(`/documentos/${id}`)
            .set('Authorization', `Bearer ${tokenOperador}`)

        expect(res.statusCode).toBe(200)
    })

    // =========================
    // SEM TOKEN
    // =========================
    it('não deve acessar sem token', async () => {
        const res = await request(app)
            .get(`/pacientes/${pacienteId}/documentos`)

        expect(res.statusCode).toBe(401)
    })
})