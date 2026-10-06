import { jest } from '@jest/globals'

const service = {
    listarFeriados: jest.fn(),
    buscarFeriado: jest.fn(),
    inserirFeriado: jest.fn(),
    atualizarFeriado: jest.fn(),
    alterarStatusFeriado: jest.fn()
}

const registrarAuditoria = jest.fn()

jest.unstable_mockModule('../src/modules/calendario/services/calendario.service.js', () => service)
jest.unstable_mockModule('../src/modules/historico_pacientes/services/auditoria.service.js', () => ({
    registrarAuditoria
}))

const {
    createFeriado,
    updateFeriado,
    patchStatusFeriado
} = await import('../src/modules/calendario/controllers/calendario.controller.js')

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

describe('calendario institucional - permissoes e auditoria', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        registrarAuditoria.mockResolvedValue({ error: null })
    })

    it('bloqueia operador de cadastrar feriado', async () => {
        const res = response()

        await createFeriado({
            user: { id: 'operador-1', perfil: 'operador' },
            body: { data: '2026-10-12', nome: 'Feriado' }
        }, res)

        expect(res.statusCode).toBe(403)
        expect(service.inserirFeriado).not.toHaveBeenCalled()
    })

    it('permite gestor cadastrar e audita a inclusao', async () => {
        const feriado = { id: 'feriado-1', data: '2026-10-12', nome: 'Nossa Senhora', ativo: true }
        service.inserirFeriado.mockResolvedValue({ data: feriado, error: null })
        const res = response()

        await createFeriado({
            user: { id: 'gestor-1', perfil: 'gestor' },
            body: feriado
        }, res)

        expect(res.statusCode).toBe(201)
        expect(res.body).toEqual(feriado)
        expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({
            entidade_tipo: 'calendario_feriado',
            acao: 'FERIADO_CRIADO',
            usuario_id: 'gestor-1'
        }))
    })

    it('audita edicao e inativacao feitas por gestor', async () => {
        const atual = { id: 'feriado-1', data: '2026-10-12', nome: 'Antigo', ativo: true }
        service.buscarFeriado.mockResolvedValue({ data: atual, error: null })
        service.atualizarFeriado.mockResolvedValue({
            data: { ...atual, nome: 'Novo' },
            error: null
        })
        service.alterarStatusFeriado.mockResolvedValue({
            data: { ...atual, ativo: false },
            error: null
        })

        const editResponse = response()
        await updateFeriado({
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: atual.id },
            body: { nome: 'Novo' }
        }, editResponse)

        const statusResponse = response()
        await patchStatusFeriado({
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: atual.id },
            body: { ativo: false }
        }, statusResponse)

        expect(editResponse.statusCode).toBe(200)
        expect(statusResponse.statusCode).toBe(200)
        expect(registrarAuditoria).toHaveBeenCalledTimes(2)
        expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: 'FERIADO_EDITADO' }))
        expect(registrarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ acao: 'FERIADO_INATIVADO' }))
    })

    it('encaminha a nova data para a edicao do feriado', async () => {
        const atual = { id: 'feriado-1', data: '2026-10-12', nome: 'Feriado antigo', ativo: true }
        service.buscarFeriado.mockResolvedValue({ data: atual, error: null })
        service.atualizarFeriado.mockResolvedValue({
            data: { ...atual, data: '2026-11-02' },
            error: null
        })
        const res = response()

        await updateFeriado({
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: atual.id },
            body: { data: '2026-11-02', nome: atual.nome }
        }, res)

        expect(res.statusCode).toBe(200)
        expect(service.atualizarFeriado).toHaveBeenCalledWith({
            id: atual.id,
            data: '2026-11-02',
            nome: atual.nome,
            usuarioId: 'gestor-1'
        })
    })
})
