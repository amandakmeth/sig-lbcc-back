import supabase from '../../../config/supabase.js';

export function statusFromFacts({ statusAtual, itens }) {
    if (statusAtual === 'cancelada' || statusAtual === 'finalizada') {
        return statusAtual;
    }

    if (!itens || itens.length === 0) {
        return 'aberta';
    }

    const everyWinner = itens.every((item) => item.vencedorId);

    if (everyWinner) {
        return 'finalizada';
    }

    const everyMin3 = itens.every(
        (item) => (item.orcamentos || []).length >= 3
    );

    if (everyMin3) {
        return 'pronta_para_analise';
    }

    const anyOrcamento = itens.some(
        (item) => (item.orcamentos || []).length > 0
    );

    if (anyOrcamento) {
        return 'em_andamento';
    }

    return 'aberta';
}

export async function aplicarStatusCotacaoPorFatos(cotacaoId) {
    const {
        data: cotacao,
        error: buscaError
    } = await supabase
        .from('cotacoes')
        .select('id, status')
        .eq('id', cotacaoId)
        .single();

    if (buscaError || !cotacao) {
        return {
            data: null,
            error: buscaError || {
                message: 'Cotação não encontrada'
            }
        };
    }

    const {
        data: fatos,
        error: fatosError
    } = await carregarFatosStatus(
        cotacaoId,
        cotacao.status
    );

    if (fatosError) {
        return {
            data: null,
            error: fatosError
        };
    }

    const novoStatus = statusFromFacts(fatos);

    if (novoStatus === cotacao.status) {
        return {
            data: cotacao,
            error: null
        };
    }

    const {
        data,
        error
    } = await supabase
        .from('cotacoes')
        .update({
            status: novoStatus
        })
        .eq('id', cotacaoId)
        .select('id, status')
        .single();

    return {
        data,
        error
    };
}

async function carregarFatosStatus(cotacaoId, statusAtual) {
    const {
        data: itens,
        error: itensError
    } = await supabase
        .from('cotacao_itens')
        .select('id')
        .eq('cotacao_id', cotacaoId);

    if (itensError) {
        return {
            data: null,
            error: itensError
        };
    }

    const {
        data: propostas,
        error: propostasError
    } = await supabase
        .from('cotacao_propostas')
        .select(`
            id,
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

    const orcamentosPorItem = new Map();

    for (const item of itens || []) {
        orcamentosPorItem.set(item.id, []);
    }

    for (const proposta of propostas || []) {
        for (const linha of proposta.cotacao_proposta_itens || []) {
            const lista = orcamentosPorItem.get(linha.item_id);

            if (lista) {
                lista.push({
                    id: linha.id
                });
            }
        }
    }

    return {
        data: {
            statusAtual,
            itens: (itens || []).map((item) => ({
                vencedorId: null,
                orcamentos: orcamentosPorItem.get(item.id) || []
            }))
        },
        error: null
    };
}
