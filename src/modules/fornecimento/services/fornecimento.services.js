import supabase from '../../../config/supabase.js';
import {
    addBusinessDays,
    calculateDeadlineStatus,
    getBrasiliaDate,
    parseBusinessDayCount,
    STATUS_PRAZO,
    toDateOnly
} from './prazo.utils.js';
import { listarDatasFeriadosAtivos } from '../../calendario/services/calendario.service.js';
import {
    registrarAuditoria,
    registrarOcorrencia
} from '../../historico_pacientes/services/auditoria.service.js';

const ORDEM_SELECT = `
    id,
    numero,
    cotacao_id,
    proposta_id,
    fornecedor_id,
    paciente_id,
    status,
    data_emissao,
    data_envio,
    recebido_em,
    recebido_por,
    status_envio,
    email_envio_tentativas,
    email_envio_proxima_tentativa,
    email_envio_ultimo_erro,
    email_envio_ultima_tentativa_em,
    email_envio_ultimo_sucesso_em,
    data_previsao_entrega,
    data_entrega,
    data_finalizacao,
    prazo_ciclo,
    status_prazo,
    prazo_atualizado_em,
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
    ),
    ordem_fornecimento_responsaveis (
        usuario_id,
        usuarios:usuario_id (
            id,
            nome,
            email,
            perfil,
            ativo
        )
    ),
    ordem_fornecimento_prazo_historico (
        id,
        ciclo,
        data_limite,
        status_prazo,
        tipo_evento,
        responsavel_ids,
        usuario_id,
        created_at
    ),
    ordens_fornecimento_envios (
        id,
        ciclo,
        tentativa,
        tipo,
        status,
        destinatario_email,
        assunto,
        nome_arquivo,
        pdf_versao,
        message_id,
        erro,
        metadados,
        agendado_em,
        iniciado_em,
        enviado_em,
        falhou_em,
        created_at
    )
`;

function normalizarOrdem(ordem) {
    if (!ordem) return ordem;

    return {
        ...ordem,
        status_envio: ordem.status_envio || 'nao_enviado',
        email_envio_tentativas: Number(ordem.email_envio_tentativas || 0),
        envios_email: (ordem.ordens_fornecimento_envios || [])
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        gestores_responsaveis: (ordem.ordem_fornecimento_responsaveis || [])
            .map((item) => item.usuarios)
            .filter(Boolean),
        prazo_historico: (ordem.ordem_fornecimento_prazo_historico || [])
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    };
}

async function obterFeriadosAtivos() {
    const resultado = await listarDatasFeriadosAtivos();
    if (resultado.error) throw resultado.error;
    return resultado.data || [];
}

async function validarGestores(responsavelIds = []) {
    const ids = [...new Set(responsavelIds)];
    if (ids.some((id) => typeof id !== 'string' || !id.trim())) {
        return { ids: [], error: { message: 'Gestores responsaveis invalidos' } };
    }

    if (ids.length === 0) return { ids, error: null };

    const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, email, perfil, ativo')
        .in('id', ids);

    if (error) return { ids, error };

    const encontrados = new Map((data || []).map((usuario) => [usuario.id, usuario]));
    const invalidos = ids.filter((id) => {
        const usuario = encontrados.get(id);
        return !usuario || usuario.perfil !== 'gestor' || usuario.ativo === false;
    });

    if (invalidos.length > 0) {
        return {
            ids,
            error: { message: 'Todos os responsaveis devem ser gestores ativos' }
        };
    }

    return { ids, error: null };
}

async function obterResponsaveis(ordemId) {
    const { data, error } = await supabase
        .from('ordem_fornecimento_responsaveis')
        .select('usuario_id')
        .eq('ordem_fornecimento_id', ordemId);

    return {
        ids: (data || []).map((item) => item.usuario_id).sort(),
        error
    };
}

async function registrarAlteracaoDePrazo({
    ordem,
    ciclo,
    dataLimite,
    statusPrazo,
    tipoEvento,
    responsavelIds,
    usuarioId,
    idempotencyKey = null,
    tipoEventoPaciente = `OF_${tipoEvento}`,
    descricao = null
}) {
    const registro = {
        ordem_fornecimento_id: ordem.id,
        ciclo,
        data_limite: dataLimite,
        status_prazo: statusPrazo,
        tipo_evento: tipoEvento,
        responsavel_ids: responsavelIds,
        usuario_id: usuarioId || null,
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {})
    }

    const historicoQuery = supabase
        .from('ordem_fornecimento_prazo_historico')
    const historico = idempotencyKey
        ? await historicoQuery.upsert([registro], {
            onConflict: 'idempotency_key',
            ignoreDuplicates: true
        })
            .select()
            .maybeSingle()
        : await historicoQuery
            .insert([registro])
            .select()
            .single();

    if (historico.error) return historico.error;

    const auditoria = await registrarAuditoria({
        entidade_tipo: 'ordem_fornecimento_prazo',
        entidade_id: ordem.id,
        acao: tipoEvento,
        usuario_id: usuarioId || null,
        dados: {
            ciclo,
            data_limite: dataLimite,
            status_prazo: statusPrazo,
            responsavel_ids: responsavelIds
        },
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {})
    });

    if (auditoria.error) return auditoria.error;

    if (ordem.paciente_id) {
        const ocorrencia = await registrarOcorrencia({
            paciente_id: ordem.paciente_id,
            usuario_id: usuarioId || null,
            tipo_evento: tipoEventoPaciente,
            descricao: descricao || `Prazo da Ordem de Fornecimento ${ordem.numero} atualizado: ${statusPrazo}`,
            referencia_id: ordem.id,
            ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {})
        });

        if (ocorrencia.error) return ocorrencia.error;
    }

    return null;
}

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
                fornecedor_id,
                prazo_entrega
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
                prazoEntrega: vencedor.cotacao_propostas.prazo_entrega,
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
    const gruposNovos = [...fornecedores.values()]
        .filter((grupo) => !fornecedoresComOrdem.has(grupo.fornecedor_id));

    if (gruposNovos.length === 0) {
        return {
            data: null,
            error: {
                message:
                    'As ordens de fornecimento desta cotaÃ§Ã£o jÃ¡ foram geradas'
            }
        };
    }

    let feriados;
    try {
        feriados = await obterFeriadosAtivos();
    } catch (error) {
        return { data: null, error };
    }

    const dataBasePrazo = getBrasiliaDate();

    for (const grupo of gruposNovos) {
        grupo.prazoDiasUteis = parseBusinessDayCount(grupo.prazoEntrega);

        if (!grupo.prazoDiasUteis) {
            return {
                data: null,
                error: {
                    message: 'A proposta vencedora deve informar o prazo de entrega em dias'
                }
            };
        }

        grupo.dataLimite = addBusinessDays(
            dataBasePrazo,
            grupo.prazoDiasUteis,
            feriados
        );
    }

    const ordensCriadas = [];

    for (const grupo of gruposNovos) {
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
                data_previsao_entrega: grupo.dataLimite,
                prazo_ciclo: 1,
                status_prazo: calculateDeadlineStatus({
                    deadline: grupo.dataLimite,
                    today: dataBasePrazo,
                    holidays: feriados
                }),
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
            ...normalizarOrdem(ordem),
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
        .select(ORDEM_SELECT)
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
        data: (data || []).map(normalizarOrdem),
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
        .select(ORDEM_SELECT)
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
        data: normalizarOrdem(data),
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
            recebido_em: new Date().toISOString(),
            recebido_por: atualizadoPor || null,
            atualizado_por: atualizadoPor || null
        })
        .eq('id', id)
        .select(ORDEM_SELECT)
        .single();

    if (error) {
        return {
            data: null,
            error
        };
    }

    return {
        data: normalizarOrdem(data),
        error: null
    };
}

export async function finalizarOrdemDeFornecimento({
    id,
    atualizadoPor
}) {
    const { data: ordem, error: buscaError } = await supabase
        .from('ordens_fornecimento')
        .select('id, numero, paciente_id, status, data_previsao_entrega, prazo_ciclo, status_prazo')
        .eq('id', id)
        .single();

    if (buscaError || !ordem) {
        return { data: null, error: { message: 'Ordem de fornecimento nao encontrada' } };
    }

    if (ordem.status === 'finalizada') {
        const responsaveis = await obterResponsaveis(id);
        if (responsaveis.error) return { data: null, error: responsaveis.error };

        const eventoError = await registrarAlteracaoDePrazo({
            ordem,
            ciclo: Number(ordem.prazo_ciclo || 1),
            dataLimite: toDateOnly(ordem.data_previsao_entrega),
            statusPrazo: ordem.status_prazo || STATUS_PRAZO.NORMAL,
            tipoEvento: 'ORDEM_FINALIZADA',
            tipoEventoPaciente: 'OF_FINALIZADA',
            descricao: `A Ordem de Fornecimento ${ordem.numero} foi finalizada.`,
            responsavelIds: responsaveis.ids,
            usuarioId: atualizadoPor,
            idempotencyKey: `of:${id}:finalizacao`
        });

        if (eventoError) return { data: null, error: eventoError };
        return await buscarOrdemDeFornecimento(id);
    }

    if (['rascunho', 'cancelada'].includes(ordem.status)) {
        return {
            data: null,
            error: { message: 'A ordem de fornecimento nao pode ser finalizada neste status' }
        };
    }

    const { data: atualizada, error: updateError } = await supabase
        .from('ordens_fornecimento')
        .update({
            status: 'finalizada',
            data_finalizacao: new Date().toISOString(),
            atualizado_por: atualizadoPor || null
        })
        .eq('id', id)
        .in('status', ['enviada', 'em_entrega', 'entregue'])
        .select('id')
        .maybeSingle();

    if (updateError) return { data: null, error: updateError };
    if (!atualizada) {
        return {
            data: null,
            error: { message: 'A ordem de fornecimento nao pode ser finalizada neste status' }
        };
    }

    const responsaveis = await obterResponsaveis(id);
    if (responsaveis.error) return { data: null, error: responsaveis.error };

    const eventoError = await registrarAlteracaoDePrazo({
        ordem,
        ciclo: Number(ordem.prazo_ciclo || 1),
        dataLimite: toDateOnly(ordem.data_previsao_entrega),
        statusPrazo: ordem.status_prazo || STATUS_PRAZO.NORMAL,
        tipoEvento: 'ORDEM_FINALIZADA',
        tipoEventoPaciente: 'OF_FINALIZADA',
        descricao: `A Ordem de Fornecimento ${ordem.numero} foi finalizada.`,
        responsavelIds: responsaveis.ids,
        usuarioId: atualizadoPor,
        idempotencyKey: `of:${id}:finalizacao`
    });

    if (eventoError) return { data: null, error: eventoError };
    return await buscarOrdemDeFornecimento(id);
}

export async function listarGestoresResponsaveis() {
    return await supabase
        .from('usuarios')
        .select('id, nome, email, perfil, ativo')
        .eq('perfil', 'gestor')
        .eq('ativo', true)
        .order('nome', { ascending: true });
}

export async function atualizarPrazoOrdem({
    id,
    dataPrevisaoEntrega,
    responsavelIds,
    atualizadoPor
}) {
    const { data: ordem, error: buscaError } = await supabase
        .from('ordens_fornecimento')
        .select('id, numero, paciente_id, status, data_previsao_entrega, prazo_ciclo, status_prazo')
        .eq('id', id)
        .single();

    if (buscaError || !ordem) {
        return { data: null, error: { message: 'Ordem de fornecimento nao encontrada' } };
    }

    if (['finalizada', 'cancelada'].includes(ordem.status)) {
        return { data: null, error: { message: 'A ordem de fornecimento nao pode ter o prazo alterado neste status' } };
    }

    const dataFoiEnviada = dataPrevisaoEntrega !== undefined;
    const novaData = dataFoiEnviada
        ? (dataPrevisaoEntrega === null ? null : toDateOnly(dataPrevisaoEntrega))
        : toDateOnly(ordem.data_previsao_entrega);

    if (dataFoiEnviada && dataPrevisaoEntrega !== null && !novaData) {
        return { data: null, error: { message: 'A data limite deve estar no formato AAAA-MM-DD' } };
    }

    const responsaveisAtuais = await obterResponsaveis(id);
    if (responsaveisAtuais.error) return { data: null, error: responsaveisAtuais.error };

    const responsaveisForamEnviados = responsavelIds !== undefined;
    const novaValidacao = await validarGestores(
        responsaveisForamEnviados ? responsavelIds : responsaveisAtuais.ids
    );
    if (novaValidacao.error) return { data: null, error: novaValidacao.error };

    const novosResponsaveis = novaValidacao.ids.sort();
    const dataMudou = novaData !== toDateOnly(ordem.data_previsao_entrega);
    const responsaveisMudaram = novosResponsaveis.join(',') !== responsaveisAtuais.ids.join(',');

    if (!dataMudou && !responsaveisMudaram) {
        return await buscarOrdemDeFornecimento(id);
    }

    let novoStatus = ordem.status_prazo || STATUS_PRAZO.NORMAL;
    if (dataMudou) {
        let feriados = [];
        try {
            feriados = await obterFeriadosAtivos();
        } catch (error) {
            return { data: null, error };
        }

        novoStatus = calculateDeadlineStatus({
            deadline: novaData,
            today: getBrasiliaDate(),
            holidays: feriados
        });
    }

    const novoCiclo = dataMudou
        ? Number(ordem.prazo_ciclo || 1) + 1
        : Number(ordem.prazo_ciclo || 1);

    const { error: updateError } = await supabase
        .from('ordens_fornecimento')
        .update({
            ...(dataFoiEnviada ? { data_previsao_entrega: novaData } : {}),
            prazo_ciclo: novoCiclo,
            status_prazo: novoStatus,
            prazo_atualizado_em: new Date().toISOString(),
            atualizado_por: atualizadoPor || null
        })
        .eq('id', id);

    if (updateError) return { data: null, error: updateError };

    if (responsaveisMudaram) {
        const { error: deleteError } = await supabase
            .from('ordem_fornecimento_responsaveis')
            .delete()
            .eq('ordem_fornecimento_id', id);

        if (deleteError) return { data: null, error: deleteError };

        if (novosResponsaveis.length > 0) {
            const { error: insertError } = await supabase
                .from('ordem_fornecimento_responsaveis')
                .insert(novosResponsaveis.map((usuarioId) => ({
                    ordem_fornecimento_id: id,
                    usuario_id: usuarioId
                })));

            if (insertError) return { data: null, error: insertError };
        }
    }

    const tipoEvento = dataMudou
        ? 'PRAZO_CICLO_ATUALIZADO'
        : 'RESPONSAVEIS_ATUALIZADOS';
    const auditoriaError = await registrarAlteracaoDePrazo({
        ordem,
        ciclo: novoCiclo,
        dataLimite: novaData,
        statusPrazo: novoStatus,
        tipoEvento,
        responsavelIds: novosResponsaveis,
        usuarioId: atualizadoPor
    });

    if (auditoriaError) return { data: null, error: auditoriaError };

    return await buscarOrdemDeFornecimento(id);
}

export async function atualizarStatusPrazoOrdem({ id, statusPrazo, usuarioId }) {
    if (!Object.values(STATUS_PRAZO).includes(statusPrazo)) {
        return { data: null, error: { message: 'Status de prazo invalido' } };
    }

    const { data: ordem, error: buscaError } = await supabase
        .from('ordens_fornecimento')
        .select('id, numero, paciente_id, status, data_previsao_entrega, prazo_ciclo, status_prazo')
        .eq('id', id)
        .single();

    if (buscaError || !ordem) {
        return { data: null, error: { message: 'Ordem de fornecimento nao encontrada' } };
    }

    if (['finalizada', 'cancelada'].includes(ordem.status)) {
        return { data: null, error: { message: 'A ordem de fornecimento nao pode ter o status de prazo alterado neste status' } };
    }

    const { data: responsaveis, error: responsaveisError } = await obterResponsaveis(id);
    if (responsaveisError) return { data: null, error: responsaveisError };

    const { error: updateError } = await supabase
        .from('ordens_fornecimento')
        .update({
            status_prazo: statusPrazo,
            prazo_atualizado_em: new Date().toISOString(),
            atualizado_por: usuarioId || null
        })
        .eq('id', id);

    if (updateError) return { data: null, error: updateError };

    const auditoriaError = await registrarAlteracaoDePrazo({
        ordem,
        ciclo: Number(ordem.prazo_ciclo || 1),
        dataLimite: toDateOnly(ordem.data_previsao_entrega),
        statusPrazo,
        tipoEvento: 'STATUS_PRAZO_ATUALIZADO',
        responsavelIds: responsaveis,
        usuarioId
    });

    if (auditoriaError) return { data: null, error: auditoriaError };
    return await buscarOrdemDeFornecimento(id);
}
