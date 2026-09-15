import supabase from '../../../config/supabase.js';

// =========================
// LISTAR COTAÇÕES
// =========================
export const listarCotacoes = async (
    ativo = true
) => {

    const { data, error } =
        await supabase
            .from('cotacoes')
            .select(`
                *,
                pacientes:paciente_id (
                    id,
                    nome
                ),
                areas:area_id (
                    id,
                    nome
                ),
                cotacao_itens (
                    id,
                    produto_id,
                    descricao,
                    quantidade,
                    unidade,
                    especificacoes,
                    ordem
                )
            `)
            .eq('ativo', ativo)
            .order('created_at', {
                ascending: false
            });

    if (error) {
        return {
            data,
            error
        };
    }

    const hoje = new Date();

    const cotacoes = data.map(cotacao => ({
        ...cotacao,
        vencida:
            new Date(cotacao.data_validade) < hoje
    }));

    return {
        data: cotacoes,
        error: null
    };
};

// =========================
// BUSCAR COTAÇÃO POR ID
// =========================
export const buscarCotacaoPorId = async (id) => {

    const {
        data,
        error
    } = await supabase
        .from('cotacoes')
        .select(`
            *,
            pacientes:paciente_id (
                id,
                nome
            ),
            areas:area_id (
                id,
                nome
            ),
            cotacao_itens (
                id,
                cotacao_id,
                produto_id,
                descricao,
                quantidade,
                unidade,
                especificacoes,
                ordem,
                created_at
            )
        `)
        .eq('id', id)
        .single();

    if (error || !data) {
        return {
            data,
            error
        };
    }

    const {
        data: cotacao,
        error: orcamentosError
    } = await anexarOrcamentosAosItens(data);

    if (orcamentosError) {
        return {
            data: null,
            error: orcamentosError
        };
    }

    return {
        data: cotacao,
        error: null
    };
};

function nomeDoFornecedor(fornecedor) {
    return fornecedor?.nome_fantasia
        || fornecedor?.razao_social
        || '';
}

async function anexarOrcamentosAosItens(cotacao) {
    const itens = (cotacao.cotacao_itens || []).map((item) => ({
        ...item,
        orcamentos: []
    }));

    const {
        data: propostas,
        error
    } = await supabase
        .from('cotacao_propostas')
        .select(`
            id,
            fornecedor_id,
            fornecedores:fornecedor_id (
                razao_social,
                nome_fantasia
            ),
            cotacao_proposta_itens (
                id,
                item_id,
                valor_unitario,
                valor_total,
                selecionada
            )
        `)
        .eq('cotacao_id', cotacao.id);

    if (error) {
        return {
            data: null,
            error
        };
    }

    const itensPorId = new Map(
        itens.map((item) => [item.id, item])
    );

    for (const proposta of propostas || []) {
        const fornecedorNome = nomeDoFornecedor(
            proposta.fornecedores
        );

        for (const linha of proposta.cotacao_proposta_itens || []) {
            const item = itensPorId.get(linha.item_id);

            if (!item) {
                continue;
            }

            item.orcamentos.push({
                id: linha.id,
                fornecedor_id: proposta.fornecedor_id,
                fornecedor_nome: fornecedorNome,
                valor_unitario: Number(linha.valor_unitario),
                valor_total: Number(linha.valor_total),
                selecionada: linha.selecionada === true
            });
        }
    }

    return {
        data: {
            ...cotacao,
            cotacao_itens: itens
        },
        error: null
    };
}

// =========================
// CRIAR COTAÇÃO + ITENS
// =========================
export const inserirCotacao = async (dados) => {

    const {
        itens = [],
        ...dadosCotacao
    } = dados || {};

    // =========================
    // VALIDAÇÃO DA COTAÇÃO
    // =========================

    if (
        !dadosCotacao.descricao ||
        !dadosCotacao.data_validade ||
        !dadosCotacao.paciente_id
    ) {
        return {
            error: {
                message:
                    'Descrição, data de validade e paciente são obrigatórios'
            }
        };
    }

    // =========================
    // VALIDAÇÃO DOS ITENS
    // =========================

    if (
        !Array.isArray(itens) ||
        itens.length === 0
    ) {
        return {
            error: {
                message:
                    'A cotação deve possuir pelo menos um item'
            }
        };
    }

    for (const [index, item] of itens.entries()) {

        if (
            !item.descricao ||
            !item.descricao.trim()
        ) {
            return {
                error: {
                    message:
                        `Descrição do item ${index + 1} é obrigatória`
                }
            };
        }

        if (
            item.quantidade === undefined ||
            item.quantidade === null ||
            Number(item.quantidade) <= 0
        ) {
            return {
                error: {
                    message:
                        `Quantidade do item ${index + 1} deve ser maior que zero`
                }
            };
        }

        if (
            !item.unidade ||
            !item.unidade.trim()
        ) {
            return {
                error: {
                    message:
                        `Unidade do item ${index + 1} é obrigatória`
                }
            };
        }
    }

    // =========================
    // VERIFICAR NÚMERO
    // =========================

    if (dadosCotacao.numero) {

        const {
            data: existe,
            error: erroNumero
        } = await supabase
            .from('cotacoes')
            .select('id')
            .eq('numero', dadosCotacao.numero)
            .maybeSingle();

        if (erroNumero) {
            return {
                data: null,
                error: erroNumero
            };
        }

        if (existe) {
            return {
                error: {
                    message:
                        'Número da cotação já existe'
                }
            };
        }
    }

    // =========================
    // STATUS INICIAL
    // =========================

    // Toda nova cotação começa como ABERTA.
    // O status será alterado posteriormente
    // conforme os orçamentos forem cadastrados.
    dadosCotacao.status = 'aberta';

    // =========================
    // CRIAR COTAÇÃO
    // =========================

    const {
        data: cotacao,
        error: erroCotacao
    } = await supabase
        .from('cotacoes')
        .insert([dadosCotacao])
        .select()
        .single();

    if (erroCotacao) {
        return {
            data: null,
            error: erroCotacao
        };
    }

    // =========================
    // PREPARAR ITENS
    // =========================

    const itensParaInserir = itens.map((item, index) => ({
        cotacao_id: cotacao.id,
        produto_id: item.produto_id ?? null,
        descricao: item.descricao.trim(),
        quantidade: Number(item.quantidade),
        unidade: item.unidade.trim(),
        especificacoes:
            item.especificacoes?.trim() || null,
        ordem:
            item.ordem !== undefined
                ? Number(item.ordem)
                : index
    }));

    // =========================
    // CRIAR ITENS
    // =========================

    const {
        data: itensCriados,
        error: erroItens
    } = await supabase
        .from('cotacao_itens')
        .insert(itensParaInserir)
        .select();

    // =========================
    // TRATAMENTO DE ERRO
    // =========================

    if (erroItens) {

        // A cotação e seus itens são inseridos
        // em operações separadas.
        // Caso os itens falhem, removemos
        // a cotação criada para evitar registro órfão.
        await supabase
            .from('cotacoes')
            .delete()
            .eq('id', cotacao.id);

        return {
            data: null,
            error: {
                message:
                    'Não foi possível criar os itens da cotação',
                detalhe: erroItens.message
            }
        };
    }

    // =========================
    // RETORNO
    // =========================

    return {
        data: {
            ...cotacao,
            cotacao_itens: itensCriados
        },
        error: null
    };
};

// =========================
// ATUALIZAR COTAÇÃO
// =========================
export const atualizarCotacao = async (
    id,
    dados
) => {

    if (
        !dados ||
        Object.keys(dados).length === 0
    ) {
        return {
            error: {
                message:
                    'Nenhum dado informado para atualização'
            }
        };
    }

    const dadosAtualizacao = {};

    if (dados.descricao !== undefined) {
        dadosAtualizacao.descricao =
            dados.descricao;
    }

    if (dados.data_validade !== undefined) {
        dadosAtualizacao.data_validade =
            dados.data_validade;
    }

    if (dados.observacoes !== undefined) {
        dadosAtualizacao.observacoes =
            dados.observacoes;
    }

    if (dados.paciente_id !== undefined) {
        dadosAtualizacao.paciente_id =
            dados.paciente_id;
    }

    if (dados.area_id !== undefined) {
        dadosAtualizacao.area_id =
            dados.area_id;
    }

    if (dados.updated_by !== undefined) {
        dadosAtualizacao.updated_by =
            dados.updated_by;
    }

    // O status de progresso NÃO é alterado aqui.
    // Para isso existe a função
    // alterarStatusProgressoCotacao().

    if (
        Object.keys(dadosAtualizacao).length === 0
    ) {
        return {
            error: {
                message:
                    'Nenhum dado válido informado para atualização'
            }
        };
    }

    const {
        data,
        error
    } = await supabase
        .from('cotacoes')
        .update(dadosAtualizacao)
        .eq('id', id)
        .select()
        .single();

    return {
        data,
        error
    };
};

// =========================
// ATIVAR / INATIVAR
// =========================
export const alterarStatusCotacao = async (id) => {

    const {
        data: cotacao,
        error: buscaError
    } = await supabase
        .from('cotacoes')
        .select('ativo')
        .eq('id', id)
        .single();

    if (buscaError || !cotacao) {
        return {
            error: {
                message:
                    'Cotação não encontrada'
            }
        };
    }

    const {
        data,
        error
    } = await supabase
        .from('cotacoes')
        .update({
            ativo: !cotacao.ativo
        })
        .eq('id', id)
        .select()
        .single();

    return {
        data,
        error
    };
};

// =========================
// ALTERAR STATUS DE PROGRESSO
// =========================
export const alterarStatusProgressoCotacao = async (
    id,
    status,
    motivoCancelamento,
    usuarioId
) => {

    const statusPermitidos = [
        'aberta',
        'em_andamento',
        'pronta_para_analise',
        'finalizada',
        'cancelada'
    ];

    // =========================
    // VALIDAR STATUS
    // =========================

    if (!statusPermitidos.includes(status)) {
        return {
            error: {
                message:
                    'Status de cotação inválido'
            }
        };
    }

    // =========================
    // VALIDAR MOTIVO DO CANCELAMENTO
    // =========================

    if (status === 'cancelada') {

        if (
            !motivoCancelamento ||
            !motivoCancelamento.trim()
        ) {
            return {
                error: {
                    message:
                        'O motivo do cancelamento é obrigatório'
                }
            };
        }
    }

    // =========================
    // BUSCAR COTAÇÃO ATUAL
    // =========================

    const {
        data: cotacao,
        error: buscaError
    } = await supabase
        .from('cotacoes')
        .select('id, status, motivo_cancelamento')
        .eq('id', id)
        .single();

    if (buscaError || !cotacao) {
        return {
            error: {
                message:
                    'Cotação não encontrada'
            }
        };
    }

    // =========================
    // BLOQUEAR FINALIZADA
    // =========================

    if (cotacao.status === 'finalizada') {
        return {
            error: {
                message:
                    'A cotação já foi finalizada e seu status não pode ser alterado.'
            }
        };
    }

    // =========================
    // BLOQUEAR CANCELADA
    // =========================

    if (cotacao.status === 'cancelada') {
        return {
            error: {
                message:
                    'A cotação já está cancelada. Essa ação é irreversível e o status não pode ser alterado novamente.'
            }
        };
    }

    // =========================
    // EVITAR MESMO STATUS
    // =========================

    if (cotacao.status === status) {
        return {
            error: {
                message:
                    `A cotação já está com o status "${status}".`
            }
        };
    }

    // =========================
    // PREPARAR ATUALIZAÇÃO
    // =========================

    const dadosAtualizacao = {
        status,
        updated_by: usuarioId
    };

    // O motivo só é registrado quando
    // a cotação é cancelada.
    if (status === 'cancelada') {
        dadosAtualizacao.motivo_cancelamento =
            motivoCancelamento.trim();
    }

    // =========================
    // ALTERAR STATUS
    // =========================

    const {
        data,
        error
    } = await supabase
        .from('cotacoes')
        .update(dadosAtualizacao)
        .eq('id', id)
        .select()
        .single();

    return {
        data,
        error
    };
};

// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
export const verificarRelacionamentosCotacaoService =
    async (id) => {

        const {
            count: propostas,
            error: error1
        } = await supabase
            .from('cotacao_propostas')
            .select('*', {
                count: 'exact',
                head: true
            })
            .eq('cotacao_id', id);

        const {
            count: itens,
            error: error2
        } = await supabase
            .from('cotacao_itens')
            .select('*', {
                count: 'exact',
                head: true
            })
            .eq('cotacao_id', id);

        if (error1 || error2) {
            return {
                error:
                    error1 || error2
            };
        }

        return {
            data: {
                possuiRelacionamentos:
                    propostas > 0 ||
                    itens > 0,

                relacionamentos: {
                    propostas,
                    itens
                }
            }
        };
    };