
import supabaseAdmin from '../../../config/supabaseAdmin.js';

const inicioDoDia = (data) => `${data}T00:00:00.000Z`;

const inicioDoDiaSeguinte = (data) => {
    const [ano, mes, dia] = data.split('-').map(Number);

    const proximoDia = new Date(
        Date.UTC(ano, mes - 1, dia + 1)
    );

    return `${proximoDia.toISOString().slice(0, 10)}T00:00:00.000Z`;
};
const consultar = async (query) => {
    const { data, error } = await query;

    if (error) {
        throw new Error(`Erro ao gerar relatório: ${error.message}`);
    }

    return data || [];
};

export const gerarRelatorioPorPeriodo = async ({ dataInicio, dataFim }) => {
    const inicio = inicioDoDia(dataInicio);
    const fim = inicioDoDiaSeguinte(dataFim);

    const [
        atendimentos,
        cotacoes,
        ordensFornecimento,
        ordensTransporte,
        divergencias,
        cancelamentos
    ] = await Promise.all([
        consultar(
            supabaseAdmin
                .from('atendimentos')
                .select(`
                    *,
                    pacientes:paciente_id (id, nome),
                    areas:area_id (id, nome),
                    cotacoes:cotacao_id (id, descricao, status)
                `)
                .gte('data_atendimento', dataInicio)
                .lte('data_atendimento', dataFim)
                .order('data_atendimento', { ascending: false })
        ),

        consultar(
            supabaseAdmin
                .from('cotacoes')
                .select(`
                    *,
                    pacientes:paciente_id (id, nome),
                    areas:area_id (id, nome)
                `)
                .gte('created_at', inicio)
                .lt('created_at', fim)
                .order('created_at', { ascending: false })
        ),

        consultar(
            supabaseAdmin
                .from('ordens_fornecimento')
                .select(`
                    *,
                    pacientes:paciente_id (id, nome),
                    fornecedores:fornecedor_id (
                        id,
                        razao_social,
                        nome_fantasia
                    ),
                    cotacao_propostas:proposta_id (
                        id,
                        cotacao_proposta_itens (
                            id,
                            valor_total,
                            selecionada
                        )
                    )
                `)
                .gte('data_emissao', inicio)
                .lt('data_emissao', fim)
                .order('data_emissao', { ascending: false })
        ),

        consultar(
            supabaseAdmin
                .from('ordens_transporte')
                .select(`
                    *,
                    pacientes:paciente_id (id, nome)
                `)
                .gte('data_emissao', inicio)
                .lt('data_emissao', fim)
                .order('data_emissao', { ascending: false })
        ),

        consultar(
            supabaseAdmin
                .from('divergencias_ordens')
                .select('*')
                .gte('identificado_em', inicio)
                .lt('identificado_em', fim)
                .order('identificado_em', { ascending: false })
        ),

        consultar(
            supabaseAdmin
                .from('solicitacoes_cancelamento_ordem')
                .select(`
                    id,
                    divergencia_id,
                    ordem_fornecimento_id,
                    ordem_transporte_id,
                    status,
                    motivo,
                    justificativa_decisao,
                    necessidade_paciente,
                    solicitado_em,
                    decidido_em,
                    solicitado_por,
                    decidido_por,
                    recotacao_id
                `)
                .or(
                    `and(solicitado_em.gte.${inicio},solicitado_em.lt.${fim}),and(decidido_em.gte.${inicio},decidido_em.lt.${fim})`
                )
                .order('solicitado_em', { ascending: false })
        )
    ]);

    const idsOF = ordensFornecimento.map(ordem => ordem.id);
    const idsOT = ordensTransporte.map(ordem => ordem.id);

    const [comprovacoesOF, comprovacoesOT] = await Promise.all([
        idsOF.length
            ? consultar(
                supabaseAdmin
                    .from('comprovacoes_of')
                    .select('id, ordem_fornecimento_id')
                    .in('ordem_fornecimento_id', idsOF)
            )
            : [],

        idsOT.length
            ? consultar(
                supabaseAdmin
                    .from('utilizacoes_voucher_ot')
                    .select('id, ordem_transporte_id')
                    .in('ordem_transporte_id', idsOT)
            )
            : []
    ]);

    const cotacaoIdsOT = [
        ...new Set(ordensTransporte.map(ordem => ordem.cotacao_id).filter(Boolean))
    ];

    const itensCotacaoOT = cotacaoIdsOT.length
        ? await consultar(
            supabaseAdmin
                .from('cotacao_itens')
                .select('id, cotacao_id, descricao')
                .in('cotacao_id', cotacaoIdsOT)
        )
        : [];

    const idsItensCotacaoOT = itensCotacaoOT.map(item => item.id);

    const itensVencedoresOT = idsItensCotacaoOT.length
        ? await consultar(
            supabaseAdmin
                .from('cotacao_proposta_itens')
                .select(`
                    item_id,
                    proposta_id,
                    valor_total,
                    selecionada,
                    cotacao_propostas:proposta_id (
                        id,
                        cotacao_id,
                        fornecedor_id
                    )
                `)
                .eq('selecionada', true)
                .in('item_id', idsItensCotacaoOT)
        )
        : [];

    const totalValorOF = ordensFornecimento.reduce(
        (total, ordem) => total + Number(ordem.valor_total || 0),
        0
    );

    const valorPorCotacaoOT = new Map();

    for (const ordem of ordensTransporte) {
    const itensDaCotacao = itensCotacaoOT.filter(
        item => item.cotacao_id === ordem.cotacao_id
    );

    const vencedoresDaCotacao = itensVencedoresOT.filter(
        item => item.cotacao_propostas?.cotacao_id === ordem.cotacao_id
    );
    const fornecedoresVencedores = [
        ...new Set(
            vencedoresDaCotacao.map(
                item => item.cotacao_propostas?.fornecedor_id
            ).filter(Boolean)
        )
    ];

    const todosItensPossuemVencedor = itensDaCotacao.length > 0 &&
        itensDaCotacao.every(item =>
            vencedoresDaCotacao.filter(
                vencedor => vencedor.item_id === item.id
            ).length === 1
        );

    const fornecedorUnico =
        fornecedoresVencedores.length === 1 &&
        fornecedoresVencedores[0] === ordem.fornecedor_id;

    if (!todosItensPossuemVencedor || !fornecedorUnico) {
        valorPorCotacaoOT.set(ordem.id, null);
        continue;
    }

    const valor = vencedoresDaCotacao.reduce(
        (total, item) => total + Number(item.valor_total || 0),
        0
    );

    valorPorCotacaoOT.set(ordem.id, valor);
    }

    const valoresOT = [...valorPorCotacaoOT.values()];

    const totalValorOT = valoresOT.reduce(
        (total, valor) => total + (valor ?? 0),
        0
    );

    const ordensOTSemValorCalculado = valoresOT.filter(
        valor => valor === null
    ).length;

    const totalPacientes = new Set(
        atendimentos.map(item => item.paciente_id).filter(Boolean)
    ).size;

    const associarDadosOrdem = (ordens, comprovacoes, campoId) =>
        ordens.map(ordem => ({
            ...ordem,
            tem_comprovacao: comprovacoes.some(
                comprovacao => comprovacao[campoId] === ordem.id
            ),
            total_comprovacoes: comprovacoes.filter(
                comprovacao => comprovacao[campoId] === ordem.id
            ).length,
            divergencias: divergencias.filter(divergencia =>
            campoId === 'ordem_fornecimento_id'
                ? divergencia.ordem_fornecimento_id === ordem.id
                : divergencia.ordem_transporte_id === ordem.id
            ),

            cancelamentos: cancelamentos.filter(cancelamento =>
                campoId === 'ordem_fornecimento_id'
                    ? cancelamento.ordem_fornecimento_id === ordem.id
                    : cancelamento.ordem_transporte_id === ordem.id
            ),
            valor_total_calculado: campoId === 'ordem_transporte_id'
                ? valorPorCotacaoOT.get(ordem.id)
                : Number(ordem.valor_total || 0),
        }));

    return {
        periodo: {
            data_inicio: dataInicio,
            data_fim: dataFim
        },

        resumo: {
            total_atendimentos: atendimentos.length,
            total_pacientes: totalPacientes,
            total_cotacoes: cotacoes.length,
            total_ordens_fornecimento: ordensFornecimento.length,
            total_ordens_transporte: ordensTransporte.length,
            valor_total_fornecimento: totalValorOF,
            valor_total_transporte: totalValorOT,
            valor_total_geral_parcial: ordensOTSemValorCalculado > 0,   
            total_divergencias: divergencias.length,
            total_cancelamentos_aprovados: cancelamentos.filter(
                item => item.status === 'aprovada'
            ).length,
            ordens_transporte_sem_valor_calculado: ordensOTSemValorCalculado,
        },

        atendimentos,
        cotacoes,

        ordens_fornecimento: associarDadosOrdem(
            ordensFornecimento,
            comprovacoesOF,
            'ordem_fornecimento_id'
        ),

        ordens_transporte: associarDadosOrdem(
            ordensTransporte,
            comprovacoesOT,
            'ordem_transporte_id'
        ),

        divergencias,
        cancelamentos
    };
};
