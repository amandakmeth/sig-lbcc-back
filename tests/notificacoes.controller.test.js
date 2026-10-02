import { jest } from '@jest/globals'

const service = {
    listarNotificacoes: jest.fn(),
    marcarNotificacaoComoLida: jest.fn(),
    arquivarNotificacao: jest.fn()
}

jest.unstable_mockModule('../src/modules/notificacoes/services/notificacoes.service.js', () => service)

const {
    listar,
    marcarComoLida,
    arquivar
} = await import('../src/modules/notificacoes/controllers/notificacoes.controller.js')

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

describe('central de notificacoes', () => {
    beforeEach(() => jest.clearAllMocks())

    it('lista somente as notificacoes do usuario autenticado', async () => {
        service.listarNotificacoes.mockResolvedValue({ data: [], error: null })
        const res = response()

        await listar({
            user: { id: 'gestor-1' },
            query: { apenas_nao_lidas: 'true' }
        }, res)

        expect(res.statusCode).toBe(200)
        expect(service.listarNotificacoes).toHaveBeenCalledWith({
            destinatarioId: 'gestor-1',
            apenasNaoLidas: true,
            incluirArquivadas: false
        })
    })

    it('nao permite operar uma notificacao que nao pertence ao usuario', async () => {
        service.marcarNotificacaoComoLida.mockResolvedValue({
            data: null,
            error: { message: 'Notificacao nao encontrada' }
        })
        const res = response()

        await marcarComoLida({
            user: { id: 'gestor-1' },
            params: { id: 'n-de-outro-usuario' }
        }, res)

        expect(res.statusCode).toBe(404)
        expect(service.marcarNotificacaoComoLida).toHaveBeenCalledWith({
            id: 'n-de-outro-usuario',
            destinatarioId: 'gestor-1'
        })
    })

    it('arquiva sem excluir fisicamente a notificacao', async () => {
        const notification = { id: 'n-1', arquivada_em: '2026-10-02T10:00:00Z' }
        service.arquivarNotificacao.mockResolvedValue({ data: notification, error: null })
        const res = response()

        await arquivar({
            user: { id: 'gestor-1' },
            params: { id: 'n-1' }
        }, res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual(notification)
    })
})
