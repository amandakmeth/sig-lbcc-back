import request from 'supertest'
import app from '../../src/app.js'

export const getTokens = async () => {
    const gestor = await request(app)
        .post('/auth/login')
        .send({
            email: 'admin@email.com',
            password: '123456'
        })

    const operador = await request(app)
        .post('/auth/login')
        .send({
            email: 'operador2@email.com',
            password: '123456'
        })

    return {
        gestor: gestor.body.access_token,
        operador: operador.body.access_token
    }
}