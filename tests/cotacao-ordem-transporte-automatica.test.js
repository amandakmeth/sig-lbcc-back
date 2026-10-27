
import { jest } from '@jest/globals';

const supabase = { from: jest.fn() };
const aplicarStatusCotacaoPorFatos = jest.fn();
const buscarCotacaoPorId = jest.fn();
const criarOrdemDeTransportePendente = jest.fn();

jest.unstable_mockModule('../src/config/supabase.js', () => ({
    default: supabase
}));

jest.unstable_mockModule(
    '../src/modules/cotacoes/services/cotacaoStatus.js',
    () => ({ aplicarStatusCotacaoPorFatos })
);

jest.unstable_mockModule(
    '../src/modules/cotacoes/services/cotacoes.service.js',
    () => ({ buscarCotacaoPorId })
);

jest.unstable_mockModule(
    '../src/modules/transporte/services/ordensTransporte.service.js',
    () => ({ criarOrdemDeTransportePendente })
);

const { escolherVencedorItem } = await import(
    '../src/modules/cotacoes/services/cotacaoOrcamentos.service.js'
);

function consultaMock({
    singleData = null,
    awaitData = null,
    error = null
} = {}) {
    const consulta = {
        select: jest.fn(),
        update: jest.fn(),
        eq: jest.fn(),
        single: jest.fn()
    };

    consulta.select.mockReturnValue(consulta);
    consulta.update.mockReturnValue(consulta);
    consulta.eq.mockReturnValue(consulta);

    consulta.single.mockResolvedValue({
        data: singleData,
        error
    });

    consulta.then = (resolve, reject) =>
        Promise.resolve({
            data: awaitData,
            error
        }).then(resolve, reject);

    return consulta;
}

describe('Criação automática de OT após finalizar cotação', () => {
    let consultasPropostaItem;

    beforeEach(() => {
        jest.clearAllMocks();

        consultasPropostaItem = 0;

        supabase.from.mockImplementation((tabela) => {
            switch (tabela) {
                case 'cotacoes':
                    return consultaMock({
                        singleData: {
                            id: 'cotacao-1',
                            ativo: true,
                            status: 'em_analise',
                            data_validade: '2099-12-31',
                            paciente_id: 'paciente-1'
                        }
                    });

                case 'cotacao_itens':
                    return consultaMock({
                        singleData: {
                            id: 'item-1',
                            cotacao_id: 'cotacao-1',
                            quantidade: 1
                        }
                    });

                case 'cotacao_proposta_itens': {
                    consultasPropostaItem++;

                    // Primeira chamada: busca o orçamento individual.
                    if (consultasPropostaItem === 1) {
                        return consultaMock({
                            singleData: {
                                id: 'linha-1',
                                item_id: 'item-1',
                                proposta_id: 'proposta-1',
                                valor_unitario: 100,
                                valor_total: 100
                            }
                        });
                    }

                    // Segunda chamada: lista os orçamentos do item.
                    if (consultasPropostaItem === 2) {
                        return consultaMock({
                            awaitData: [
                                { id: 'linha-1' },
                                { id: 'linha-2' },
                                { id: 'linha-3' }
                            ]
                        });
                    }

                    // Chamadas seguintes: atualizações do vencedor.
                    return consultaMock();
                }

                case 'cotacao_propostas':
                    return consultaMock({
                        singleData: {
                            id: 'proposta-1',
                            cotacao_id: 'cotacao-1',
                            fornecedor_id: 'fornecedor-1',
                            valor_total: 100
                        }
                    });

                default:
                    throw new Error(
                        `Tabela não simulada no teste: ${tabela}`
                    );
            }
        });

        aplicarStatusCotacaoPorFatos.mockResolvedValue({
            error: null
        });

        buscarCotacaoPorId.mockResolvedValue({
            data: {
                id: 'cotacao-1',
                status: 'finalizada',
                areas: { nome: 'Transporte urbano' }
            },
            error: null
        });

        criarOrdemDeTransportePendente.mockResolvedValue({
            data: {
                id: 'ot-1',
                status: 'pendente'
            },
            error: null
        });
    });

    it('solicita OT quando a cotação urbana é finalizada', async () => {
        const resultado = await escolherVencedorItem({
            cotacaoId: 'cotacao-1',
            itemId: 'item-1',
            orcamentoId: 'linha-1',
            createdBy: 'usuario-1'
        });

        expect(resultado.error).toBeNull();

        expect(criarOrdemDeTransportePendente).toHaveBeenCalledWith({
            cotacaoId: 'cotacao-1',
            criadoPor: 'usuario-1'
        });
    });

    it('não solicita OT automática para Transporte privado', async () => {
        buscarCotacaoPorId.mockResolvedValue({
            data: {
                id: 'cotacao-1',
                status: 'finalizada',
                areas: { nome: 'Transporte privado' }
            },
            error: null
        });

        const resultado = await escolherVencedorItem({
            cotacaoId: 'cotacao-1',
            itemId: 'item-1',
            orcamentoId: 'linha-1',
            createdBy: 'usuario-1'
        });

        expect(resultado.error).toBeNull();
        expect(resultado.data.status).toBe('finalizada');
        expect(
            criarOrdemDeTransportePendente
        ).not.toHaveBeenCalled();
    });

    it('informa falha ao criar OT sem ocultar o resultado da cotação', async () => {
        criarOrdemDeTransportePendente.mockResolvedValue({
            data: null,
            error: {
                message: 'Falha simulada',
                code: 'ERRO_TESTE'
            }
        });

        const resultado = await escolherVencedorItem({
            cotacaoId: 'cotacao-1',
            itemId: 'item-1',
            orcamentoId: 'linha-1',
            createdBy: 'usuario-1'
        });

        expect(resultado.error).toBeNull();
        expect(resultado.data.status).toBe('finalizada');
        expect(resultado.data.aviso_ot).toBeTruthy();
        expect(resultado.data.codigo_erro_ot).toBe('ERRO_TESTE');
    });
});
