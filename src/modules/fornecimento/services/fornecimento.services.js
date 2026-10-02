import supabase from '../../../config/supabase.js';

// =========================
// GERAR ORDENS DE FORNECIMENTO
// =========================

export async function gerarOrdensDeFornecimento({
    cotacaoId,
    criadoPor
}) {
    const {
        data: cotacao,
        error: cotacaoError
    } = await supabase
        .from('cotacoes')
        .select(`
            id,
            status,
            paciente_id
        `)
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

    if (cotacao.status !== 'finalizada') {
        return {
            data: null,
            error: {
                message:
                    'Só é possível gerar ordens de fornecimento para uma cotação finalizada'
            }
        };
    }

    const {
        data: vencedores,
        error: vencedoresError
    } = await supabase
        .from('cotacao_proposta_itens')
        .select(`
            id,
            item_id,
            proposta_id,
            valor_unitario,
            valor_total,
            cotacao_propostas:proposta_id (
                id,
                cotacao_id,
                fornecedor_id
            ),
            cotacao_itens:item_id (
                id,
                cotacao_id,
                produto_id,
                descricao,
                quantidade,
                unidade
            )
        `)
        .eq('selecionada', true);

    if (vencedoresError) {
        return {
            data: null,
            error: vencedoresError
        };
    }

    const vencedoresDaCotacao = (vencedores || []).filter(
        (linha) =>
            linha.cotacao_propostas
            && linha.cotacao_propostas.cotacao_id === cotacaoId
            && linha.cotacao_itens
            && linha.cotacao_itens.cotacao_id === cotacaoId
    );

    if (vencedoresDaCotacao.length === 0) {
        return {
            data: null,
            error: {
                message:
                    'Nenhum orçamento vencedor foi encontrado para esta cotação'
            }
        };
    }

    const fornecedores = new Map();

    for (const vencedor of vencedoresDaCotacao) {
        const fornecedorId =
            vencedor.cotacao_propostas.fornecedor_id;

        if (!fornecedores.has(fornecedorId)) {
            fornecedores.set(fornecedorId, {
                fornecedor_id: fornecedorId,
                proposta_id: vencedor.proposta_id,
                itens: []
            });
        }

        fornecedores.get(fornecedorId).itens.push(vencedor);
    }

    const {
        data: ordensExistentes,
        error: ordensExistentesError
    } = await supabase
        .from('ordens_fornecimento')
        .select('id, fornecedor_id')
        .eq('cotacao_id', cotacaoId);

    if (ordensExistentesError) {
        return {
            data: null,
            error: ordensExistentesError
        };
    }

    const fornecedoresComOrdem = new Set(
        (ordensExistentes || []).map(
            (ordem) => ordem.fornecedor_id
        )
    );

    const ordensCriadas = [];

    for (const grupo of fornecedores.values()) {
        if (fornecedoresComOrdem.has(grupo.fornecedor_id)) {
            continue;
        }

        const valorTotal = grupo.itens.reduce(
            (total, item) =>
                total + Number(item.valor_total || 0),
            0
        );

        const numero = await gerarNumeroOrdem();

        const {
            data: ordem,
            error: ordemError
        } = await supabase
            .from('ordens_fornecimento')
            .insert([{
                numero,
                cotacao_id: cotacaoId,
                proposta_id: grupo.proposta_id,
                fornecedor_id: grupo.fornecedor_id,
                paciente_id: cotacao.paciente_id,
                status: 'rascunho',
                valor_total: valorTotal,
                criado_por: criadoPor || null
            }])
            .select()
            .single();

        if (ordemError) {
            return {
                data: null,
                error: ordemError
            };
        }

        const itensParaInserir = grupo.itens.map(
            (vencedor) => {
                const item = vencedor.cotacao_itens;

                return {
                    ordem_fornecimento_id: ordem.id,
                    cotacao_item_id: item.id,
                    proposta_id: vencedor.proposta_id,
                    produto_id: item.produto_id || null,
                    descricao: item.descricao,
                    quantidade_solicitada:
                        Number(item.quantidade),
                    quantidade_entregue: 0,
                    unidade: item.unidade,
                    valor_unitario:
                        Number(vencedor.valor_unitario),
                    valor_total:
                        Number(vencedor.valor_total),
                    observacoes: null
                };
            }
        );

        const {
            data: itensCriados,
            error: itensError
        } = await supabase
            .from('ordem_fornecimento_itens')
            .insert(itensParaInserir)
            .select();

        if (itensError) {
            await supabase
                .from('ordens_fornecimento')
                .delete()
                .eq('id', ordem.id);

            return {
                data: null,
                error: itensError
            };
        }

        ordensCriadas.push({
            ...ordem,
            itens: itensCriados
        });
    }

    if (ordensCriadas.length === 0) {
        return {
            data: null,
            error: {
                message:
                    'As ordens de fornecimento desta cotação já foram geradas'
            }
        };
    }

    return {
        data: ordensCriadas,
        error: null
    };
}

async function gerarNumeroOrdem() {
    const ano = new Date().getFullYear();

    const {
        data: ultimaOrdem,
        error
    } = await supabase
        .from('ordens_fornecimento')
        .select('numero')
        .like('numero', `OF-${ano}-%`)
        .order('numero', {
            ascending: false
        })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw error;
    }

    let sequencia = 1;

    if (ultimaOrdem?.numero) {
        const partes = ultimaOrdem.numero.split('-');
        const ultimaSequencia =
            Number(partes[partes.length - 1]);

        if (!Number.isNaN(ultimaSequencia)) {
            sequencia = ultimaSequencia + 1;
        }
    }

    return `OF-${ano}-${String(sequencia).padStart(4, '0')}`;
}


// =========================
// LISTAR ORDENS DE FORNECIMENTO
// =========================

export async function listarOrdensDeFornecimento() {
    const {
        data,
        error
    } = await supabase
        .from('ordens_fornecimento')
        .select(`
            id,
            numero,
            cotacao_id,
            proposta_id,
            fornecedor_id,
            paciente_id,
            status,
            data_emissao,
            data_envio,
            data_previsao_entrega,
            data_entrega,
            data_finalizacao,
            valor_total,
            observacoes,
            criado_por,
            atualizado_por,
            created_at,
            updated_at,
            fornecedores (
                id,
                razao_social,
                nome_fantasia,
                cnpj,
                email,
                telefone
            ),
            ordem_fornecimento_itens (
                id,
                cotacao_item_id,
                proposta_id,
                produto_id,
                descricao,
                quantidade_solicitada,
                quantidade_entregue,
                unidade,
                valor_unitario,
                valor_total,
                observacoes
            )
        `)
        .order('created_at', {
            ascending: false
        });

    if (error) {
        return {
            data: null,
            error
        };
    }

    return {
        data,
        error: null
    };
}


// =========================
// BUSCAR ORDEM DE FORNECIMENTO
// =========================

export async function buscarOrdemDeFornecimento(id) {
    const {
        data,
        error
    } = await supabase
        .from('ordens_fornecimento')
        .select(`
            id,
            numero,
            cotacao_id,
            proposta_id,
            fornecedor_id,
            paciente_id,
            status,
            data_emissao,
            data_envio,
            data_previsao_entrega,
            data_entrega,
            data_finalizacao,
            valor_total,
            observacoes,
            criado_por,
            atualizado_por,
            created_at,
            updated_at,
            fornecedores (
                id,
                razao_social,
                nome_fantasia,
                cnpj,
                email,
                telefone
            ),
            ordem_fornecimento_itens (
                id,
                cotacao_item_id,
                proposta_id,
                produto_id,
                descricao,
                quantidade_solicitada,
                quantidade_entregue,
                unidade,
                valor_unitario,
                valor_total,
                observacoes
            )
        `)
        .eq('id', id)
        .single();

    if (error || !data) {
        return {
            data: null,
            error: {
                message: 'Ordem de fornecimento não encontrada'
            }
        };
    }

    return {
        data,
        error: null
    };
}


// =========================
// CONFIRMAR RECEBIMENTO
// =========================

export async function confirmarRecebimentoOrdemDeFornecimento({
    id,
    atualizadoPor
}) {

    // =========================
    // BUSCAR ORDEM
    // =========================

    const {
        data: ordem,
        error: buscaError
    } = await supabase
        .from('ordens_fornecimento')
        .select(`
            id,
            numero,
            paciente_id,
            status
        `)
        .eq('id', id)
        .single();

    if (buscaError || !ordem) {
        return {
            data: null,
            error: {
                message:
                    'Ordem de fornecimento não encontrada'
            }
        };
    }


    // =========================
    // VALIDAR STATUS
    // =========================

    if (ordem.status !== 'enviada') {
        return {
            data: null,
            error: {
                message:
                    'A confirmação de recebimento só pode ser realizada para uma ordem de fornecimento com status enviada'
            }
        };
    }


    // =========================
    // ATUALIZAR ORDEM
    // =========================

    const {
        data,
        error
    } = await supabase
        .from('ordens_fornecimento')
        .update({
            status: 'em_entrega',
            atualizado_por: atualizadoPor || null
        })
        .eq('id', id)
        .select(`
            id,
            numero,
            cotacao_id,
            proposta_id,
            fornecedor_id,
            paciente_id,
            status,
            data_emissao,
            data_envio,
            data_previsao_entrega,
            data_entrega,
            data_finalizacao,
            valor_total,
            observacoes,
            criado_por,
            atualizado_por,
            created_at,
            updated_at,
            fornecedores (
                id,
                razao_social,
                nome_fantasia,
                cnpj,
                email,
                telefone
            ),
            ordem_fornecimento_itens (
                id,
                cotacao_item_id,
                proposta_id,
                produto_id,
                descricao,
                quantidade_solicitada,
                quantidade_entregue,
                unidade,
                valor_unitario,
                valor_total,
                observacoes
            )
        `)
        .single();

    if (error) {
        return {
            data: null,
            error
        };
    }

    return {
        data,
        error: null
    };
}