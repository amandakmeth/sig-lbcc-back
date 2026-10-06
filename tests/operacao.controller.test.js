import 'dotenv/config'
import {
    consultarExecucoes,
    processarPrazosManualmente
} from '../src/modules/operacao/controllers/operacao.controller.js'

function response() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code
            return this
        },
        json(body) {
            this.body = body
            return this
        }
    }
}

describe('controle manual da automacao', () => {
    it('bloqueia processamento manual para operador', async () => {
        const res = response()

        await processarPrazosManualmente({
            user: { id: 'operador-1', perfil: 'operador' },
            body: {}
        }, res)

        expect(res.statusCode).toBe(403)
    })

    it('bloqueia consulta operacional para operador', async () => {
        const res = response()

        await consultarExecucoes({
            user: { id: 'operador-1', perfil: 'operador' },
            query: {}
        }, res)

        expect(res.statusCode).toBe(403)
    })

    it('valida os tipos de processamento antes de acessar o banco', async () => {
        const res = response()

        await processarPrazosManualmente({
            user: { id: 'gestor-1', perfil: 'gestor' },
            body: { jobs: ['nao-existe'] }
        }, res)

        expect(res.statusCode).toBe(400)
    })
})
