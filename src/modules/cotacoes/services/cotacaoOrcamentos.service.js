import supabase from '../../../config/supabase.js';
import { aplicarStatusCotacaoPorFatos } from './cotacaoStatus.js';
import { buscarCotacaoPorId } from './cotacoes.service.js';

export async function inserirOrcamentosNoItem({
    cotacaoId,
    itemId,
    blocos,
    createdBy
}) {
    if (!Array.isArray(blocos) || blocos.length === 0) {
        return {
            data: null,
            error: {
                message: 'Informe ao menos um orçamento'
            }
        };
    }

    const fornecedorIds = [];

    for (const [index, bloco] of blocos.entries()) {
        if (!bloco?.fornecedor_id) {
            return {
                data: null,
                error: {
                    message:
                        `Fornecedor do orçamento ${index + 1} é obrigatório`
                }
            };
        }

        const valorUnitario = Number(bloco.valor_unitario);

        if (Number.isNaN(valorUnitario) || valorUnitario <= 0) {
            return {
                data: null,
                error: {
                    message:
                        'Valor unitário deve ser um número maior que zero'
                }
            };
        }

        fornecedorIds.push(bloco.fornecedor_id);
    }

    if (new Set(fornecedorIds).size !== fornecedorIds.length) {
        return {
            data: null,
            error: {
                message:
                    'Não é permitido repetir o mesmo fornecedor no mesmo item'
            }
        };
    }

    const {
        data: cotacao,
        error: cotacaoError
    } = await supabase
        .from('cotacoes')
        .select('id, ativo, status')
        .eq('id', cotacaoId)
        .single();

    if (cotacaoError || !cotacao) {
        return {
            data: null,
            error: {
                message: 'Cotação não encontrada'
            }
        };
    }

    if (!cotacao.ativo) {
        return {
            data: null,
            error: {
                message:
                    'Não é possível registrar orçamento para uma cotação inativa'
            }
        };
    }

    if (
        cotacao.status === 'finalizada' ||
        cotacao.status === 'cancelada'
    ) {
        return {
            data: null,
            error: {
                message:
                    'Não é possível registrar orçamento para uma cotação encerrada'
            }
        };
    }

    const {
        data: item,
        error: itemError
    } = await supabase
        .from('cotacao_itens')
        .select('id, cotacao_id, quantidade')
        .eq('id', itemId)
        .single();

    if (itemError || !item || item.cotacao_id !== cotacaoId) {
        return {
            data: null,
            error: {
                message:
                    'O item informado não pertence à cotação'
            }
        };
    }

    const {
        data: fornecedores,
        error: fornecedoresError
    } = await supabase
        .from('fornecedores')
        .select('id, ativo')
        .in('id', fornecedorIds);

    if (fornecedoresError) {
        return {
            data: null,
            error: fornecedoresError
        };
    }

    if (!fornecedores || fornecedores.length !== fornecedorIds.length) {
        return {
            data: null,
            error: {
                message: 'Fornecedor não encontrado'
            }
        };
    }

    const fornecedorInativo = fornecedores.find(
        (fornecedor) => fornecedor.ativo === false
    );

    if (fornecedorInativo) {
        return {
            data: null,
            error: {
                message:
                    'Fornecedor inativo não pode receber orçamento'
            }
        };
    }

    const {
        data: propostasExistentes,
        error: propostasError
    } = await supabase
        .from('cotacao_propostas')
        .select(`
            id,
            fornecedor_id,
            valor_total,
            cotacao_proposta_itens (
                id,
                item_id
            )
        `)
        .eq('cotacao_id', cotacaoId);

    if (propostasError) {
        return {
            data: null,
            error: propostasError
        };
    }

    const fornecedoresNoItem = new Set();
    const envelopePorFornecedor = new Map();

    for (const proposta of propostasExistentes || []) {
        envelopePorFornecedor.set(proposta.fornecedor_id, proposta);

        for (const linha of proposta.cotacao_proposta_itens || []) {
            if (linha.item_id === itemId) {
                fornecedoresNoItem.add(proposta.fornecedor_id);
            }
        }
    }

    for (const fornecedorId of fornecedorIds) {
        if (fornecedoresNoItem.has(fornecedorId)) {
            return {
                data: null,
                error: {
                    message:
                        'Já existe orçamento deste fornecedor neste item'
                }
            };
        }
    }

    const quantidade = Number(item.quantidade);
    const hoje = new Date().toISOString().slice(0, 10);
    const envelopesCriados = [];
    const linhasParaInserir = [];
    const totaisReusados = [];

    for (const bloco of blocos) {
        const valorUnitario = Number(bloco.valor_unitario);
        const valorTotal = quantidade * valorUnitario;

        let envelope = envelopePorFornecedor.get(bloco.fornecedor_id);

        if (!envelope) {
            const {
                data: criado,
                error: erroEnvelope
            } = await supabase
                .from('cotacao_propostas')
                .insert([{
                    cotacao_id: cotacaoId,
                    fornecedor_id: bloco.fornecedor_id,
                    data_proposta: hoje,
                    valor_total: valorTotal,
                    selecionada: false,
                    observacoes: bloco.observacoes || null,
                    created_by: createdBy || null
                }])
                .select()
                .single();

            if (erroEnvelope) {
                await removerEnvelopes(envelopesCriados);

                return {
                    data: null,
                    error: erroEnvelope
                };
            }

            envelopesCriados.push(criado.id);

            envelope = {
                ...criado,
                cotacao_proposta_itens: []
            };

            envelopePorFornecedor.set(
                bloco.fornecedor_id,
                envelope
            );
        } else {
            totaisReusados.push({
                id: envelope.id,
                valor_total:
                    Number(envelope.valor_total || 0) + valorTotal
            });
        }

        linhasParaInserir.push({
            proposta_id: envelope.id,
            item_id: itemId,
            valor_unitario: valorUnitario,
            valor_total: valorTotal,
            observacoes: bloco.observacoes || null
        });
    }

    const { error: erroLinhas } = await supabase
        .from('cotacao_proposta_itens')
        .insert(linhasParaInserir);

    if (erroLinhas) {
        await removerEnvelopes(envelopesCriados);

        return {
            data: null,
            error: erroLinhas
        };
    }

    for (const total of totaisReusados) {
        const { error: erroUpdate } = await supabase
            .from('cotacao_propostas')
            .update({
                valor_total: total.valor_total
            })
            .eq('id', total.id);

        if (erroUpdate) {
            return {
                data: null,
                error: erroUpdate
            };
        }
    }

    const {
        error: statusError
    } = await aplicarStatusCotacaoPorFatos(cotacaoId);

    if (statusError) {
        return {
            data: null,
            error: statusError
        };
    }

    return buscarCotacaoPorId(cotacaoId);
}

async function removerEnvelopes(ids) {
    if (!ids.length) {
        return;
    }

    await supabase
        .from('cotacao_propostas')
        .delete()
        .in('id', ids);
}
