import 'dotenv/config'
import { jest } from '@jest/globals'

const reminderService = {
    buscarLembreteFornecedor: jest.fn(),
    enviarLembreteFornecedor: jest.fn(),
    LEMBRETE_STATUS: {
        FALHA_RECUPERAVEL: 'falha_recuperavel',
        FALHA_DEFINITIVA: 'falha_definitiva'
    },
    MAX_TENTATIVAS_LEMBRETE: 3
}

jest.unstable_mockModule('../src/modules/notificacoes/services/lembretes-fornecedor.service.js', () => reminderService)

const { reenviarLembreteFornecedor } = await import(
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

describe('reenvio do lembrete ao fornecedor', () => {
    beforeEach(() => jest.clearAllMocks())

    it('permite reenvio somente para gestor', async () => {
        const res = response()

        await reenviarLembreteFornecedor({
            user: { id: 'operador-1', perfil: 'operador' },
            params: { id: 'of-1' }
        }, res)

        expect(res.statusCode).toBe(403)
        expect(reminderService.buscarLembreteFornecedor).not.toHaveBeenCalled()
    })

    it('reenvia uma falha registrada e devolve o status atualizado', async () => {
        const antes = {
            id: 'l-1',
            ordem_fornecimento_id: 'of-1',
            prazo_ciclo: 1,
            status: 'falha_recuperavel',
            tentativas_realizadas: 1
        }
        const depois = { ...antes, status: 'enviado', tentativas_realizadas: 2 }
        reminderService.buscarLembreteFornecedor
            .mockResolvedValueOnce({ data: antes, error: null })
            .mockResolvedValueOnce({ data: depois, error: null })
        reminderService.enviarLembreteFornecedor.mockResolvedValue({ data: depois, error: null })
        const res = response()

        await reenviarLembreteFornecedor({
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: 'of-1' }
        }, res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual(depois)
        expect(reminderService.enviarLembreteFornecedor).toHaveBeenCalledWith({
            ordemId: 'of-1',
            ciclo: 1,
            manual: true,
            usuarioId: 'gestor-1'
        })
    })
})
