import 'dotenv/config'
import { jest } from '@jest/globals'

const service = {
    gerarOrdensDeFornecimento: jest.fn(),
    listarOrdensDeFornecimento: jest.fn(),
    buscarOrdemDeFornecimento: jest.fn(),
    confirmarRecebimentoOrdemDeFornecimento: jest.fn(),
    listarGestoresResponsaveis: jest.fn(),
    atualizarPrazoOrdem: jest.fn(),
    atualizarStatusPrazoOrdem: jest.fn(),
    finalizarOrdemDeFornecimento: jest.fn()
}

jest.unstable_mockModule('../src/modules/fornecimento/services/fornecimento.services.js', () => service)

const { finalizarOrdem } = await import(
    '../src/modules/fornecimento/controller/fornecimento.controller.js'
)

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

describe('finalizacao da ordem de fornecimento', () => {
    beforeEach(() => jest.clearAllMocks())

    it('bloqueia operador e nao inicia novo processamento', async () => {
        const res = response()

        await finalizarOrdem({
            user: { id: 'operador-1', perfil: 'operador' },
            params: { id: 'of-1' }
        }, res)

        expect(res.statusCode).toBe(403)
        expect(service.finalizarOrdemDeFornecimento).not.toHaveBeenCalled()
    })

    it('permite gestor finalizar e devolve a ordem atualizada', async () => {
        const ordem = {
            id: 'of-1',
            status: 'finalizada',
            status_prazo: 'atrasada',
            prazo_historico: [
                { tipo_evento: 'PRAZO_ATRASO_ATINGIDO', status_prazo: 'atrasada' }
            ]
        }
        service.finalizarOrdemDeFornecimento.mockResolvedValue({ data: ordem, error: null })
        const res = response()

        await finalizarOrdem({
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: 'of-1' }
        }, res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual(ordem)
        expect(service.finalizarOrdemDeFornecimento).toHaveBeenCalledWith({
            id: 'of-1',
            atualizadoPor: 'gestor-1'
        })
    })
})
