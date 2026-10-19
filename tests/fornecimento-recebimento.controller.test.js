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
    atualizarObservacoesOrdemDeFornecimento: jest.fn(),
    finalizarOrdemDeFornecimento: jest.fn(),
}

const auditoria = {
    registrarOcorrencia: jest.fn(),
    registrarAuditoria: jest.fn()
}

jest.unstable_mockModule(
    '../src/modules/fornecimento/services/fornecimento.services.js',
    () => service
)

jest.unstable_mockModule(
    '../src/modules/historico_pacientes/services/auditoria.service.js',
    () => auditoria
)

const {
    confirmarRecebimento,
    atualizarObservacoes
} = await import(
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

describe('confirmacao de recebimento da ordem de fornecimento', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('bloqueia usuario sem perfil autorizado', async () => {
        const res = response()

        await confirmarRecebimento({
            user: { id: 'usuario-1', perfil: 'consultor' },
            params: { id: 'of-1' }
        }, res)

        expect(res.statusCode).toBe(403)
        expect(service.confirmarRecebimentoOrdemDeFornecimento)
            .not.toHaveBeenCalled()
        expect(auditoria.registrarOcorrencia).not.toHaveBeenCalled()
    })

    it('permite gestor confirmar o recebimento', async () => {
        const ordem = {
            id: 'of-1',
            numero: 'OF-001',
            paciente_id: 'paciente-1',
            status: 'em_entrega',
            recebido_em: '2026-10-18T12:00:00.000Z',
            recebido_por: 'gestor-1',
            data_previsao_entrega: '2026-10-28'
        }

        service.confirmarRecebimentoOrdemDeFornecimento.mockResolvedValue({
            data: ordem,
            error: null
        })

        const res = response()

        await confirmarRecebimento({
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: 'of-1' }
        }, res)

        expect(res.statusCode).toBe(200)
        expect(service.confirmarRecebimentoOrdemDeFornecimento)
            .toHaveBeenCalledWith({
                id: 'of-1',
                atualizadoPor: 'gestor-1',
                canalConfirmacao: null
            })

        expect(auditoria.registrarOcorrencia).not.toHaveBeenCalled()
        expect(res.body.message).toMatch(/confirmado com sucesso/i)
    })

    it('permite operador autorizado confirmar o recebimento', async () => {
        service.confirmarRecebimentoOrdemDeFornecimento.mockResolvedValue({
            data: {
                id: 'of-2',
                numero: 'OF-002',
                paciente_id: 'paciente-2',
                status: 'em_entrega'
            },
            error: null
        })

        const res = response()

        await confirmarRecebimento({
            user: { id: 'operador-1', perfil: 'operador' },
            params: { id: 'of-2' }
        }, res)

        expect(res.statusCode).toBe(200)
        expect(service.confirmarRecebimentoOrdemDeFornecimento)
            .toHaveBeenCalledWith({
                id: 'of-2',
                atualizadoPor: 'operador-1',
                canalConfirmacao: null
            })

        expect(auditoria.registrarOcorrencia).not.toHaveBeenCalled()
    })

    it('rejeita nova tentativa quando o recebimento ja foi confirmado', async () => {
        service.confirmarRecebimentoOrdemDeFornecimento.mockResolvedValue({
            data: null,
            error: { message: 'Recebimento ja confirmado' }
        })

        const res = response()

        await confirmarRecebimento({
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: 'of-1' }
        }, res)

        expect(res.statusCode).toBe(400)
        expect(service.confirmarRecebimentoOrdemDeFornecimento)
            .toHaveBeenCalledTimes(1)
        expect(auditoria.registrarOcorrencia).not.toHaveBeenCalled()
    })

    it('envia o canal WhatsApp para o serviço de confirmação', async () => {
        service.confirmarRecebimentoOrdemDeFornecimento.mockResolvedValue({
            data: {
                id: 'of-canal',
                numero: 'OF-CANAL',
                paciente_id: 'paciente-1',
                status: 'em_entrega'
            },
            error: null
        })

        const res = response()

        await confirmarRecebimento({
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: 'of-canal' },
            body: { canal_confirmacao: 'whatsapp' }
        }, res)

        expect(res.statusCode).toBe(200)
        expect(service.confirmarRecebimentoOrdemDeFornecimento)
            .toHaveBeenCalledWith({
                id: 'of-canal',
                atualizadoPor: 'gestor-1',
                canalConfirmacao: 'whatsapp'
            })

        expect(auditoria.registrarOcorrencia).not.toHaveBeenCalled()
    })

    it('rejeita canal de confirmação inválido sem confirmar a OF', async () => {
        const res = response()

        await confirmarRecebimento({
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: 'of-invalida' },
            body: { canal_confirmacao: 'telegram' }
        }, res)

        expect(res.statusCode).toBe(400)
        expect(service.confirmarRecebimentoOrdemDeFornecimento)
            .not.toHaveBeenCalled()
        expect(auditoria.registrarOcorrencia).not.toHaveBeenCalled()
    })

    it('permite confirmar sem informar o canal', async () => {
        service.confirmarRecebimentoOrdemDeFornecimento.mockResolvedValue({
            data: {
                id: 'of-sem-canal',
                numero: 'OF-SEM-CANAL',
                paciente_id: 'paciente-1',
                status: 'em_entrega'
            },
            error: null
        })

        const res = response()

        await confirmarRecebimento({
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: 'of-sem-canal' }
        }, res)

        expect(res.statusCode).toBe(200)
        expect(service.confirmarRecebimentoOrdemDeFornecimento)
            .toHaveBeenCalledWith({
                id: 'of-sem-canal',
                atualizadoPor: 'gestor-1',
                canalConfirmacao: null
            })

        expect(auditoria.registrarOcorrencia).not.toHaveBeenCalled()
    })

    it('retorna erro quando a transação de confirmação falha', async () => {
        service.confirmarRecebimentoOrdemDeFornecimento.mockResolvedValue({
            data: null,
            error: { message: 'Falha simulada na transação' }
        })

        const res = response()

        await confirmarRecebimento({
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: 'of-auditoria' }
        }, res)

        expect(service.confirmarRecebimentoOrdemDeFornecimento)
            .toHaveBeenCalledTimes(1)
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toMatch(/falha simulada na transação/i)
        expect(auditoria.registrarOcorrencia).not.toHaveBeenCalled()
    })

    describe('atualizacao das observacoes da ordem de fornecimento', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('bloqueia usuario sem perfil gestor', async () => {
        const res = response()

        await atualizarObservacoes({
            user: { id: 'usuario-1', perfil: 'consultor' },
            params: { id: 'of-1' },
            body: { observacoes: 'Nova observação' }
        }, res)

        expect(res.statusCode).toBe(403)
        expect(service.atualizarObservacoesOrdemDeFornecimento)
            .not.toHaveBeenCalled()
    })

    it('rejeita campos que nao podem ser alterados', async () => {
        const res = response()

        await atualizarObservacoes({
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: 'of-1' },
            body: {
                observacoes: 'Nova observação',
                paciente_id: 'paciente-2',
                fornecedor_id: 'fornecedor-2'
            }
        }, res)

        expect(res.statusCode).toBe(400)
        expect(service.atualizarObservacoesOrdemDeFornecimento)
            .not.toHaveBeenCalled()
    })

    it('permite gestor atualizar observacoes', async () => {
        const ordem = {
            id: 'of-1',
            observacoes: 'Nova observação',
            paciente_id: 'paciente-1',
            fornecedor_id: 'fornecedor-1',
            cotacao_id: 'cotacao-1'
        }

        service.atualizarObservacoesOrdemDeFornecimento.mockResolvedValue({
            data: ordem,
            error: null
        })

        const res = response()

        await atualizarObservacoes({
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: 'of-1' },
            body: { observacoes: 'Nova observação' }
        }, res)

        expect(res.statusCode).toBe(200)
        expect(service.atualizarObservacoesOrdemDeFornecimento)
            .toHaveBeenCalledWith({
                id: 'of-1',
                observacoes: 'Nova observação',
                atualizadoPor: 'gestor-1'
            })

        expect(res.body.data.paciente_id).toBe('paciente-1')
        expect(res.body.data.fornecedor_id).toBe('fornecedor-1')
        expect(res.body.data.cotacao_id).toBe('cotacao-1')
    })

    it('retorna 404 quando a ordem nao existe', async () => {
        service.atualizarObservacoesOrdemDeFornecimento.mockResolvedValue({
            data: null,
            error: { message: 'Ordem de fornecimento não encontrada' }
        })

        const res = response()

        await atualizarObservacoes({
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: 'of-inexistente' },
            body: { observacoes: 'Teste' }
        }, res)

        expect(res.statusCode).toBe(404)
    })
})
})