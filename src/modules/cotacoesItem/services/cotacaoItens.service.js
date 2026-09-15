import supabase from '../../../config/supabase.js';
import { aplicarStatusCotacaoPorFatos } from '../../cotacoes/services/cotacaoStatus.js';

// =========================
// LISTAR ITENS DA COTAÇÃO
// =========================
export const listarItensCotacao = async (cotacaoId) => {

    return await supabase
        .from('cotacao_itens')
        .select(`
            *,
            produtos:produto_id (
                id,
                nome,
                unidade
            )
        `)
        .eq('cotacao_id', cotacaoId)
        .order('ordem', {
            ascending: true
        });
};

// =========================
// BUSCAR ITEM POR ID
// =========================
export const buscarItemPorId = async (id) => {

    return await supabase
        .from('cotacao_itens')
        .select(`
            *,
            produtos:produto_id (
                id,
                nome,
                unidade
            )
        `)
        .eq('id', id)
        .single();
};

// =========================
// VERIFICAR STATUS DA COTAÇÃO
// =========================
const verificarCotacaoEditavel = async (cotacaoId) => {

    const {
        data: cotacao,
        error
    } = await supabase
        .from('cotacoes')
        .select('id, status')
        .eq('id', cotacaoId)
        .single();

    if (error || !cotacao) {
        return {
            error: {
                message:
                    'Cotação não encontrada'
            }
        };
    }

    // Cotação finalizada não pode mais ser alterada
    if (cotacao.status === 'finalizada') {
        return {
            error: {
                message:
                    'A cotação já foi finalizada e seus itens não podem ser alterados.'
            }
        };
    }

    // Cotação cancelada não pode mais ser alterada
    if (cotacao.status === 'cancelada') {
        return {
            error: {
                message:
                    'A cotação está cancelada e seus itens não podem ser alterados.'
            }
        };
    }

    return {
        data: cotacao,
        error: null
    };
};

// =========================
// VALIDAR DADOS DO ITEM
// =========================
const validarDadosItem = (dados) => {

    if (
        !dados.descricao ||
        !dados.descricao.trim()
    ) {
        return {
            message:
                'Descrição do item é obrigatória'
        };
    }

    if (
        dados.quantidade === undefined ||
        dados.quantidade === null ||
        Number(dados.quantidade) <= 0
    ) {
        return {
            message:
                'Quantidade do item deve ser maior que zero'
        };
    }

    if (
        !dados.unidade ||
        !dados.unidade.trim()
    ) {
        return {
            message:
                'Unidade do item é obrigatória'
        };
    }

    return null;
};

// =========================
// INSERIR ITEM
// =========================
export const inserirItemCotacao = async (dados) => {

    if (!dados || !dados.cotacao_id) {
        return {
            data: null,
            error: {
                message:
                    'Cotação é obrigatória'
            }
        };
    }

    // =========================
    // VERIFICAR COTAÇÃO
    // =========================

    const verificacao =
        await verificarCotacaoEditavel(
            dados.cotacao_id
        );

    if (verificacao.error) {
        return {
            data: null,
            error: verificacao.error
        };
    }

    // =========================
    // VALIDAR ITEM
    // =========================

    const erroValidacao =
        validarDadosItem(dados);

    if (erroValidacao) {
        return {
            data: null,
            error: erroValidacao
        };
    }

    // =========================
    // PREPARAR DADOS
    // =========================

    const dadosItem = {
        cotacao_id: dados.cotacao_id,
        produto_id: dados.produto_id ?? null,
        descricao: dados.descricao.trim(),
        quantidade: Number(dados.quantidade),
        unidade: dados.unidade.trim(),
        especificacoes:
            dados.especificacoes?.trim() || null,
        ordem:
            dados.ordem !== undefined
                ? Number(dados.ordem)
                : 0
    };

    // =========================
    // INSERIR
    // =========================

    const inserido = await supabase
        .from('cotacao_itens')
        .insert([dadosItem])
        .select()
        .single();

    if (inserido.error) {
        return inserido;
    }

    const {
        error: statusError
    } = await aplicarStatusCotacaoPorFatos(dados.cotacao_id);

    if (statusError) {
        return {
            data: null,
            error: statusError
        };
    }

    return inserido;
};

// =========================
// ATUALIZAR ITEM
// =========================
export const atualizarItemCotacao = async (
    id,
    dados
) => {

    if (
        !dados ||
        Object.keys(dados).length === 0
    ) {
        return {
            data: null,
            error: {
                message:
                    'Nenhum dado informado para atualização'
            }
        };
    }

    // =========================
    // BUSCAR ITEM
    // =========================

    const {
        data: item,
        error: erroBusca
    } = await supabase
        .from('cotacao_itens')
        .select('id, cotacao_id')
        .eq('id', id)
        .single();

    if (erroBusca || !item) {
        return {
            data: null,
            error: {
                message:
                    'Item da cotação não encontrado'
            }
        };
    }

    // =========================
    // VERIFICAR COTAÇÃO
    // =========================

    const verificacao =
        await verificarCotacaoEditavel(
            item.cotacao_id
        );

    if (verificacao.error) {
        return {
            data: null,
            error: verificacao.error
        };
    }

    // =========================
    // PREPARAR DADOS
    // =========================

    const dadosAtualizacao = {};

    if (dados.produto_id !== undefined) {
        dadosAtualizacao.produto_id =
            dados.produto_id;
    }

    if (dados.descricao !== undefined) {

        if (
            !dados.descricao ||
            !dados.descricao.trim()
        ) {
            return {
                data: null,
                error: {
                    message:
                        'Descrição do item é obrigatória'
                }
            };
        }

        dadosAtualizacao.descricao =
            dados.descricao.trim();
    }

    if (dados.quantidade !== undefined) {

        if (
            dados.quantidade === null ||
            Number(dados.quantidade) <= 0
        ) {
            return {
                data: null,
                error: {
                    message:
                        'Quantidade do item deve ser maior que zero'
                }
            };
        }

        dadosAtualizacao.quantidade =
            Number(dados.quantidade);
    }

    if (dados.unidade !== undefined) {

        if (
            !dados.unidade ||
            !dados.unidade.trim()
        ) {
            return {
                data: null,
                error: {
                    message:
                        'Unidade do item é obrigatória'
                }
            };
        }

        dadosAtualizacao.unidade =
            dados.unidade.trim();
    }

    if (dados.especificacoes !== undefined) {
        dadosAtualizacao.especificacoes =
            dados.especificacoes?.trim() || null;
    }

    if (dados.ordem !== undefined) {
        dadosAtualizacao.ordem =
            Number(dados.ordem);
    }

    // =========================
    // VERIFICAR DADOS
    // =========================

    if (
        Object.keys(dadosAtualizacao).length === 0
    ) {
        return {
            data: null,
            error: {
                message:
                    'Nenhum dado válido informado para atualização'
            }
        };
    }

    // =========================
    // ATUALIZAR
    // =========================

    const atualizado = await supabase
        .from('cotacao_itens')
        .update(dadosAtualizacao)
        .eq('id', id)
        .select()
        .single();

    if (atualizado.error) {
        return atualizado;
    }

    if (dadosAtualizacao.quantidade !== undefined) {
        const erroRecalc = await recalcularTotaisDoItem(
            id,
            dadosAtualizacao.quantidade
        );

        if (erroRecalc) {
            return {
                data: null,
                error: erroRecalc
            };
        }
    }

    const {
        error: statusError
    } = await aplicarStatusCotacaoPorFatos(item.cotacao_id);

    if (statusError) {
        return {
            data: null,
            error: statusError
        };
    }

    return atualizado;
};

// =========================
// DELETAR ITEM
// =========================
export const deletarItemCotacao = async (id) => {

    // =========================
    // BUSCAR ITEM
    // =========================

    const {
        data: item,
        error: erroBusca
    } = await supabase
        .from('cotacao_itens')
        .select('id, cotacao_id')
        .eq('id', id)
        .single();

    if (erroBusca || !item) {
        return {
            data: null,
            error: {
                message:
                    'Item da cotação não encontrado'
            }
        };
    }

    // =========================
    // VERIFICAR COTAÇÃO
    // =========================

    const verificacao =
        await verificarCotacaoEditavel(
            item.cotacao_id
        );

    if (verificacao.error) {
        return {
            data: null,
            error: verificacao.error
        };
    }

    const {
        data: itens,
        error: itensError
    } = await supabase
        .from('cotacao_itens')
        .select('id')
        .eq('cotacao_id', item.cotacao_id);

    if (itensError) {
        return {
            data: null,
            error: itensError
        };
    }

    if ((itens || []).length <= 1) {
        return {
            data: null,
            error: {
                message:
                    'Não é permitido apagar o último item da cotação'
            }
        };
    }

    // =========================
    // APAGAR ORÇAMENTOS DO ITEM
    // =========================

    const erroOrcamentos = await apagarOrcamentosDoItem(id);

    if (erroOrcamentos) {
        return {
            data: null,
            error: erroOrcamentos
        };
    }

    // =========================
    // DELETAR
    // =========================

    const deletado = await supabase
        .from('cotacao_itens')
        .delete()
        .eq('id', id);

    if (deletado.error) {
        return deletado;
    }

    const {
        error: statusError
    } = await aplicarStatusCotacaoPorFatos(item.cotacao_id);

    if (statusError) {
        return {
            data: null,
            error: statusError
        };
    }

    return deletado;
};

async function apagarOrcamentosDoItem(itemId) {
    const {
        data: linhas,
        error: linhasError
    } = await supabase
        .from('cotacao_proposta_itens')
        .select('id, proposta_id')
        .eq('item_id', itemId);

    if (linhasError) {
        return linhasError;
    }

    if (!linhas || linhas.length === 0) {
        return null;
    }

    const propostaIds = [
        ...new Set(linhas.map((linha) => linha.proposta_id))
    ];

    const {
        error: deleteLinhasError
    } = await supabase
        .from('cotacao_proposta_itens')
        .delete()
        .eq('item_id', itemId);

    if (deleteLinhasError) {
        return deleteLinhasError;
    }

    for (const propostaId of propostaIds) {
        const erroEnvelope = await sincronizarValorTotalDoEnvelope(propostaId);

        if (erroEnvelope) {
            return erroEnvelope;
        }
    }

    return null;
}

async function recalcularTotaisDoItem(itemId, quantidade) {
    const {
        data: linhas,
        error: linhasError
    } = await supabase
        .from('cotacao_proposta_itens')
        .select('id, proposta_id, valor_unitario')
        .eq('item_id', itemId);

    if (linhasError) {
        return linhasError;
    }

    if (!linhas || linhas.length === 0) {
        return null;
    }

    const propostaIds = new Set();

    for (const linha of linhas) {
        const valorTotal =
            Number(quantidade) * Number(linha.valor_unitario);

        const { error: erroLinha } = await supabase
            .from('cotacao_proposta_itens')
            .update({
                valor_total: valorTotal
            })
            .eq('id', linha.id);

        if (erroLinha) {
            return erroLinha;
        }

        propostaIds.add(linha.proposta_id);
    }

    for (const propostaId of propostaIds) {
        const erroEnvelope = await sincronizarValorTotalDoEnvelope(propostaId);

        if (erroEnvelope) {
            return erroEnvelope;
        }
    }

    return null;
}

async function sincronizarValorTotalDoEnvelope(propostaId) {
    const {
        data: restantes,
        error: restantesError
    } = await supabase
        .from('cotacao_proposta_itens')
        .select('id, valor_total')
        .eq('proposta_id', propostaId);

    if (restantesError) {
        return restantesError;
    }

    if (!restantes || restantes.length === 0) {
        const { error: erroEnvelope } = await supabase
            .from('cotacao_propostas')
            .delete()
            .eq('id', propostaId);

        return erroEnvelope || null;
    }

    const valorTotal = restantes.reduce(
        (soma, restante) => soma + Number(restante.valor_total || 0),
        0
    );

    const { error: erroEnvelope } = await supabase
        .from('cotacao_propostas')
        .update({
            valor_total: valorTotal
        })
        .eq('id', propostaId);

    return erroEnvelope || null;
}