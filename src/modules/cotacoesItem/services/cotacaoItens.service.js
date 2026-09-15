import supabase from '../../../config/supabase.js';

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

    return await supabase
        .from('cotacao_itens')
        .insert([dadosItem])
        .select()
        .single();
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

    return await supabase
        .from('cotacao_itens')
        .update(dadosAtualizacao)
        .eq('id', id)
        .select()
        .single();
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

    // =========================
    // DELETAR
    // =========================

    return await supabase
        .from('cotacao_itens')
        .delete()
        .eq('id', id);
};