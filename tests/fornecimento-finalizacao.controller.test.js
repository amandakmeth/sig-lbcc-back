
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
    finalizarOrdemDeFornecimento: jest.fn()
}

const auditoria = {
    registrarOcorrencia: jest.fn(),
    registrarAuditoria: jest.fn()
}

// Simula o serviço principal para não acessar o Supabase real.
jest.unstable_mockModule(
    '../src/modules/fornecimento/services/fornecimento.services.js',
    () => service
)

// Simula o serviço de auditoria.
jest.unstable_mockModule(
    '../src/modules/historico_pacientes/services/auditoria.service.js',
    () => auditoria
)

// Simula o serviço de lembretes.
jest.unstable_mockModule(
    '../src/modules/notificacoes/services/lembretes-fornecedor.service.js',
    () => ({
        buscarLembreteFornecedor: jest.fn(),
        enviarLembreteFornecedor: jest.fn(),
        LEMBRETE_STATUS: {
            PENDENTE: 'pendente',
            ENVIADO: 'enviado',
            FALHA_RECUPERAVEL: 'falha_recuperavel',
            FALHA_DEFINITIVA: 'falha_definitiva'
        },
        MAX_TENTATIVAS_LEMBRETE: 3
    })
)

// Simula o serviço de envio de e-mails.
jest.unstable_mockModule(
    '../src/modules/fornecimento/services/ordem-fornecimento-email.service.js',
    () => ({
        agendarEnvioInicial: jest.fn(),
        obterPdfOrdemDeFornecimento: jest.fn(),
        processarEnvioOrdemDeFornecimento: jest.fn(),
        solicitarReenvioOrdemDeFornecimento: jest.fn()
    })
)
// Simula o serviço de recibos para não inicializar o Supabase real.
jest.unstable_mockModule(
    '../src/modules/fornecimento/services/fornecimento-recibo.service.js',
    () => ({
        reenviarReciboFinalizacaoOF: jest.fn()
    })
)
// Importa o controller somente depois de registrar os mocks.
const {
    confirmarRecebimento,
    atualizarObservacoes,
    reenviarReciboOF
} = await import(
    '../src/modules/fornecimento/controller/fornecimento.controller.js'
)
const reciboService = await import(
    '../src/modules/fornecimento/services/fornecimento-recibo.service.js'
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

        expect(
            service.confirmarRecebimentoOrdemDeFornecimento
        ).not.toHaveBeenCalled()

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

        expect(
            service.confirmarRecebimentoOrdemDeFornecimento
        ).toHaveBeenCalledWith({
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

        expect(
            service.confirmarRecebimentoOrdemDeFornecimento
        ).toHaveBeenCalledWith({
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

        expect(
            service.confirmarRecebimentoOrdemDeFornecimento
        ).toHaveBeenCalledTimes(1)

        expect(auditoria.registrarOcorrencia).not.toHaveBeenCalled()
    })

    it('envia o canal WhatsApp para o servico de confirmacao', async () => {
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

        expect(
            service.confirmarRecebimentoOrdemDeFornecimento
        ).toHaveBeenCalledWith({
            id: 'of-canal',
            atualizadoPor: 'gestor-1',
            canalConfirmacao: 'whatsapp'
        })
    })
})

describe('reenvio do recibo da ordem de fornecimento', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('bloqueia usuario que nao seja gestor', async () => {
        const req = {
            user: { id: 'usuario-1', perfil: 'operador' },
            params: { id: 'of-123' }
        }
        const res = response()

        await reenviarReciboOF(req, res)

        expect(res.statusCode).toBe(403)
        expect(
            reciboService.reenviarReciboFinalizacaoOF
        ).not.toHaveBeenCalled()
    })

    it('permite gestor reenviar o recibo', async () => {
        reciboService.reenviarReciboFinalizacaoOF.mockResolvedValue({
            data: { status: 'enviado' },
            error: null
        })

        const req = {
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: 'of-123' }
        }
        const res = response()

        await reenviarReciboOF(req, res)

        expect(
            reciboService.reenviarReciboFinalizacaoOF
        ).toHaveBeenCalledWith({
            ordemId: 'of-123',
            usuarioId: 'gestor-1'
        })
        expect(res.statusCode).toBe(200)
        expect(res.body.data.status).toBe('enviado')
    })

    it('retorna 404 quando o recibo nao existe', async () => {
        reciboService.reenviarReciboFinalizacaoOF.mockResolvedValue({
            data: null,
            error: {
                code: 'RECIBO_NAO_ENCONTRADO',
                message: 'Recibo nao encontrado'
            }
        })

        const req = {
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: 'of-123' }
        }
        const res = response()

        await reenviarReciboOF(req, res)

        expect(res.statusCode).toBe(404)
        expect(res.body.code).toBe('RECIBO_NAO_ENCONTRADO')
    })

    it('retorna 409 quando o recibo ja esta sendo enviado', async () => {
        reciboService.reenviarReciboFinalizacaoOF.mockResolvedValue({
            data: null,
            error: {
                code: 'RECIBO_EM_ENVIO',
                message: 'Recibo em processo de envio'
            }
        })

        const req = {
            user: { id: 'gestor-1', perfil: 'gestor' },
            params: { id: 'of-123' }
        }
        const res = response()

        await reenviarReciboOF(req, res)

        expect(res.statusCode).toBe(409)
    })
})
