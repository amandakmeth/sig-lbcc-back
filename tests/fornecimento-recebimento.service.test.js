import { jest } from '@jest/globals'

const ordemOriginal = {
    id: 'of-1',
    numero: 'OF-001',
    cotacao_id: 'cotacao-1',
    fornecedor_id: 'fornecedor-1',
    paciente_id: 'paciente-1',
    status: 'em_entrega',
    data_previsao_entrega: '2026-10-28',
    prazo_ciclo: 1,
    status_prazo: 'normal',
    recebido_em: '2026-10-18T15:00:00.000Z',
    recebido_por: 'gestor-1',
    atualizado_por: 'gestor-1'
}

let resultadoRpc
let resultadoBusca

const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => resultadoBusca)
}

const db = {
    from: jest.fn((tabela) => {
        if (tabela !== 'ordens_fornecimento') {
            throw new Error(`Tabela inesperada: ${tabela}`)
        }

        return builder
    })
}

const supabaseAdmin = {
    rpc: jest.fn(async () => resultadoRpc)
}

jest.unstable_mockModule('../src/config/supabase.js', () => ({
    default: db
}))

jest.unstable_mockModule('../src/config/supabaseAdmin.js', () => ({
    default: supabaseAdmin
}))

jest.unstable_mockModule(
    '../src/modules/calendario/services/calendario.service.js',
    () => ({
        listarDatasFeriadosAtivos: jest.fn(async () => ({
            data: [],
            error: null
        }))
    })
)

jest.unstable_mockModule(
    '../src/modules/historico_pacientes/services/auditoria.service.js',
    () => ({
        registrarAuditoria: jest.fn(),
        registrarOcorrencia: jest.fn()
    })
)

const {
    confirmarRecebimentoOrdemDeFornecimento,
    atualizarObservacoesOrdemDeFornecimento
} = await import(
    '../src/modules/fornecimento/services/fornecimento.services.js'
)

describe('servico de confirmacao de recebimento da OF', () => {
    beforeEach(() => {
        jest.clearAllMocks()

        resultadoRpc = {
            data: {
                ok: true,
                id: 'of-1'
            },
            error: null
        }

        resultadoBusca = {
            data: ordemOriginal,
            error: null
        }
    })

    it('confirma a OF pela RPC e preserva o prazo original', async () => {
        const resultado = await confirmarRecebimentoOrdemDeFornecimento({
            id: 'of-1',
            atualizadoPor: 'gestor-1'
        })

        expect(resultado.error).toBeNull()
        expect(resultado.data.status).toBe('em_entrega')
        expect(resultado.data.recebido_em).toBeTruthy()
        expect(resultado.data.recebido_por).toBe('gestor-1')
        expect(resultado.data.data_previsao_entrega).toBe('2026-10-28')
        expect(resultado.data.prazo_ciclo).toBe(1)

        expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
            'confirmar_recebimento_ordem',
            {
                p_id: 'of-1',
                p_atualizado_por: 'gestor-1',
                p_canal_confirmacao: null
            }
        )

        expect(db.from).toHaveBeenCalledWith('ordens_fornecimento')
    })

    it('envia o canal de confirmacao para a RPC', async () => {
        await confirmarRecebimentoOrdemDeFornecimento({
            id: 'of-1',
            atualizadoPor: 'gestor-1',
            canalConfirmacao: 'whatsapp'
        })

        expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
            'confirmar_recebimento_ordem',
            {
                p_id: 'of-1',
                p_atualizado_por: 'gestor-1',
                p_canal_confirmacao: 'whatsapp'
            }
        )
    })

    it('rejeita a confirmacao quando a RPC informa que a OF nao e elegivel', async () => {
        resultadoRpc = {
            data: {
                ok: false,
                message:
                    'Apenas ordens enviadas podem ter o recebimento confirmado.'
            },
            error: null
        }

        const resultado = await confirmarRecebimentoOrdemDeFornecimento({
            id: 'of-1',
            atualizadoPor: 'gestor-1'
        })

        expect(resultado.data).toBeNull()
        expect(resultado.error.message).toMatch(/apenas ordens enviadas/i)
        expect(db.from).not.toHaveBeenCalled()
    })

    it('retorna erro do banco quando a RPC falha', async () => {
        resultadoRpc = {
            data: null,
            error: {
                message: 'Erro de banco simulado'
            }
        }

        const resultado = await confirmarRecebimentoOrdemDeFornecimento({
            id: 'of-1',
            atualizadoPor: 'gestor-1'
        })

        expect(resultado.data).toBeNull()
        expect(resultado.error.message).toBe('Erro de banco simulado')
        expect(db.from).not.toHaveBeenCalled()
    })

    it('retorna erro se nao conseguir recuperar a OF apos a RPC', async () => {
        resultadoBusca = {
            data: null,
            error: {
                message: 'Erro ao consultar ordem'
            }
        }

        const resultado = await confirmarRecebimentoOrdemDeFornecimento({
            id: 'of-1',
            atualizadoPor: 'gestor-1'
        })

        expect(resultado.data).toBeNull()
        expect(resultado.error.message).toBe('Erro ao buscar ordem de fornecimento')
    })

    describe('servico de atualizacao de observacoes da OF - RF_F10', () => {
    beforeEach(() => {
        jest.clearAllMocks()

        resultadoRpc = {
            data: { ok: true },
            error: null
        }

        resultadoBusca = {
            data: {
                ...ordemOriginal,
                observacoes: 'Observação atualizada'
            },
            error: null
        }
    })

    it('atualiza observacoes pela RPC com os parametros corretos', async () => {
        const resultado = await atualizarObservacoesOrdemDeFornecimento({
            id: 'of-1',
            observacoes: 'Observação atualizada',
            atualizadoPor: 'gestor-1'
        })

        expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
            'atualizar_observacoes_ordem_fornecimento',
            {
                p_id: 'of-1',
                p_observacoes: 'Observação atualizada',
                p_usuario_id: 'gestor-1'
            }
        )

        expect(resultado.error).toBeNull()
        expect(resultado.data.observacoes).toBe('Observação atualizada')
        expect(db.from).toHaveBeenCalledWith('ordens_fornecimento')
    })

    it('retorna erro quando a RPC falha', async () => {
        resultadoRpc = {
            data: null,
            error: {
                message: 'Erro de banco simulado'
            }
        }

        const resultado = await atualizarObservacoesOrdemDeFornecimento({
            id: 'of-1',
            observacoes: 'Nova observação',
            atualizadoPor: 'gestor-1'
        })

        expect(resultado.data).toBeNull()
        expect(resultado.error.message).toBe('Erro de banco simulado')
        expect(db.from).not.toHaveBeenCalled()
    })

    it('retorna erro quando a RPC informa que a OF nao existe', async () => {
        resultadoRpc = {
            data: {
                ok: false,
                message: 'Ordem de fornecimento não encontrada'
            },
            error: null
        }

        const resultado = await atualizarObservacoesOrdemDeFornecimento({
            id: 'of-inexistente',
            observacoes: 'Nova observação',
            atualizadoPor: 'gestor-1'
        })

        expect(resultado.data).toBeNull()
        expect(resultado.error.message).toMatch(/ordem de fornecimento não encontrada/i)
        expect(db.from).not.toHaveBeenCalled()
    })

    it('retorna erro quando a RPC tem sucesso mas a busca da OF falha', async () => {
        resultadoBusca = {
            data: null,
            error: {
                message: 'Erro ao consultar ordem'
            }
        }

        const resultado = await atualizarObservacoesOrdemDeFornecimento({
            id: 'of-1',
            observacoes: 'Nova observação',
            atualizadoPor: 'gestor-1'
        })

        expect(resultado.data).toBeNull()
        expect(resultado.error.message).toBe(
            'Erro ao buscar ordem de fornecimento'
        )
    })
})
})
