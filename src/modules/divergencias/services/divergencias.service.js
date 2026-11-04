import supabaseAdmin from '../../../config/supabaseAdmin.js';
import {
    EVIDENCIA_BUCKET,
    enviarEvidencias,
    removerEvidenciasSemRegistro
} from '../../comprovacoes/services/comprovacoes.service.js';

function erro(message, code = 'VALIDATION_ERROR', details = undefined) {
    return { message, code, ...(details ? { details } : {}) };
}

function normalizarRpc(data, dbError) {
    if (dbError) return { data: null, error: erro(dbError.message || 'Não foi possível concluir a operação.', 'ERRO_PERSISTENCIA') };
    if (!data?.ok) return { data: null, error: erro(data?.message || 'Não foi possível concluir a operação.', data?.code || 'ERRO_PERSISTENCIA', data) };
    return { data, error: null };
}

const TIPOS_DIVERGENCIA = new Set([
    'erro_administrativo', 'fornecimento_parcial', 'atraso_pendencia',
    'voucher_perdido_recusado', 'execucao_inviavel', 'quantidade_excedente',
    'posto_divergente', 'outro'
]);

export async function criarDivergencia({
    tipoOrdem,
    ordemId,
    tipo,
    descricao,
    impeditiva,
    dados = {},
    usuarioId,
    idempotencyKey
}) {
    if (!['OF', 'OT'].includes(tipoOrdem) || !ordemId || !TIPOS_DIVERGENCIA.has(tipo) || !descricao?.trim()
        || descricao.length > 4000 || typeof impeditiva !== 'boolean' || !usuarioId
        || !idempotencyKey || idempotencyKey.length > 200) {
        return { data: null, error: erro('Informe a ordem, o tipo, a descrição e o grau impeditivo.', 'DADOS_OBRIGATORIOS') };
    }
    const { data, error: dbError } = await supabaseAdmin.rpc('criar_divergencia_ordem', {
        p_tipo_ordem: tipoOrdem,
        p_ordem_id: ordemId,
        p_tipo: tipo,
        p_descricao: descricao.trim(),
        p_impeditiva: impeditiva,
        p_dados: dados,
        p_usuario_id: usuarioId,
        p_idempotency_key: idempotencyKey
    });
    return normalizarRpc(data, dbError);
}

export async function listarDivergencias(filters = {}) {
    let query = supabaseAdmin.from('divergencias_ordens').select('*').order('created_at', { ascending: false }).limit(200);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.tipo) query = query.eq('tipo', filters.tipo);
    if (filters.impeditiva !== undefined) query = query.eq('impeditiva', filters.impeditiva);
    if (filters.tipo_ordem === 'OF') query = query.not('ordem_fornecimento_id', 'is', null);
    if (filters.tipo_ordem === 'OT') query = query.not('ordem_transporte_id', 'is', null);
    if (filters.ordem_id) {
        query = filters.tipo_ordem === 'OT'
            ? query.eq('ordem_transporte_id', filters.ordem_id)
            : query.eq('ordem_fornecimento_id', filters.ordem_id);
    }
    const { data, error: dbError } = await query;
    if (dbError) return { data: null, error: erro('Não foi possível consultar as divergências.', 'ERRO_CONSULTA') };
    return { data: data || [], error: null };
}

export async function buscarDivergencia(id) {
    const { data: divergence, error: divergenceError } = await supabaseAdmin
        .from('divergencias_ordens').select('*').eq('id', id).maybeSingle();
    if (divergenceError || !divergence) return { data: null, error: erro('Divergência não encontrada.', 'DIVERGENCIA_NAO_ENCONTRADA') };
    const [eventsResult, stepsResult, generalEvidenceResult, cancellationsResult] = await Promise.all([
        supabaseAdmin.from('divergencia_eventos').select('*').eq('divergencia_id', id).order('created_at', { ascending: false }),
        supabaseAdmin.from('divergencia_providencias').select('*').eq('divergencia_id', id).order('data_providencia', { ascending: false }),
        supabaseAdmin.from('ordem_evidencias').select('id, divergencia_id, providencia_id, nome_arquivo, content_type, tamanho_bytes, enviado_por, created_at').eq('divergencia_id', id),
        supabaseAdmin.from('solicitacoes_cancelamento_ordem').select('*').eq('divergencia_id', id).order('solicitado_em', { ascending: false })
    ]);
    const queryError = eventsResult.error || stepsResult.error || generalEvidenceResult.error || cancellationsResult.error;
    if (queryError) return { data: null, error: erro('Não foi possível carregar o histórico da divergência.', 'ERRO_CONSULTA') };
    const steps = stepsResult.data || [];
    const stepIds = steps.map((step) => step.id);
    const stepsEvidenceResult = stepIds.length
        ? await supabaseAdmin.from('ordem_evidencias')
            .select('id, divergencia_id, providencia_id, nome_arquivo, content_type, tamanho_bytes, enviado_por, created_at')
            .in('providencia_id', stepIds)
        : { data: [], error: null };
    if (stepsEvidenceResult.error) return { data: null, error: erro('Não foi possível carregar as evidências das providências.', 'ERRO_CONSULTA') };
    const evidence = [...(generalEvidenceResult.data || []), ...(stepsEvidenceResult.data || [])];
    const byStep = new Map();
    for (const item of evidence) {
        if (item.providencia_id) byStep.set(item.providencia_id, [...(byStep.get(item.providencia_id) || []), item]);
    }
    const [orderResult, voucherResult] = divergence.ordem_fornecimento_id
        ? await Promise.all([
            supabaseAdmin.from('ordens_fornecimento').select('id, numero, status, paciente_id, observacoes').eq('id', divergence.ordem_fornecimento_id).maybeSingle(),
            Promise.resolve({ data: null, error: null })
        ])
        : await Promise.all([
            supabaseAdmin.from('ordens_transporte').select('id, numero, status, paciente_id, posto_abastecimento, quantidade_autorizada').eq('id', divergence.ordem_transporte_id).maybeSingle(),
            supabaseAdmin.from('ordem_transporte_vouchers').select('id, numero_via, tipo_via, codigo, invalidado_em, motivo_invalidacao, substitui_voucher_id').eq('ordem_transporte_id', divergence.ordem_transporte_id).order('numero_via', { ascending: true })
        ]);
    if (orderResult.error || voucherResult.error) return { data: null, error: erro('Não foi possível carregar a ordem relacionada.', 'ERRO_CONSULTA') };
    return {
        data: {
            ...divergence,
            ordem: orderResult.data,
            vouchers: voucherResult.data || [],
            eventos: eventsResult.data || [],
            providencias: steps.map((item) => ({ ...item, evidencias: byStep.get(item.id) || [] })),
            evidencias: evidence.filter((item) => item.divergencia_id === id),
            cancelamentos: cancellationsResult.data || []
        },
        error: null
    };
}

export async function transicionarDivergencia({ id, status, justificativa, comprovacao, usuarioId }) {
    const { data, error: dbError } = await supabaseAdmin.rpc('transicionar_divergencia_ordem', {
        p_divergencia_id: id, p_novo_status: status, p_justificativa: justificativa,
        p_comprovacao: comprovacao || null, p_usuario_id: usuarioId
    });
    return normalizarRpc(data, dbError);
}

export async function registrarProvidencia({ id, descricao, observacoes, responsavelId, previsaoRegularizacao, usuarioId, files = [] }) {
    const { data, error: dbError } = await supabaseAdmin.rpc('registrar_providencia_divergencia', {
        p_divergencia_id: id,
        p_descricao: descricao,
        p_observacoes: observacoes || null,
        p_responsavel_id: responsavelId || null,
        p_previsao_regularizacao: previsaoRegularizacao || null,
        p_usuario_id: usuarioId
    });
    const result = normalizarRpc(data, dbError);
    if (result.error || !files.length) return result;
    const upload = await enviarEvidencias(files, `divergencias/${id}/providencias/${result.data.providencia.id}`);
    if (upload.error) return { data: { ...result.data, aviso_evidencia: upload.error.message }, error: null };
    const rows = upload.data.map((file) => ({ ...file, providencia_id: result.data.providencia.id, bucket: EVIDENCIA_BUCKET, enviado_por: usuarioId }));
    const { error: insertError } = await supabaseAdmin.from('ordem_evidencias').insert(rows);
    if (insertError) {
        await removerEvidenciasSemRegistro(upload.data.map((file) => file.storage_path));
        return { data: { ...result.data, aviso_evidencia: 'A providência foi registrada, mas os anexos não puderam ser vinculados.' }, error: null };
    }
    return result;
}

export async function anexarEvidenciasDivergencia({ id, usuarioId, files = [], providenciaId = null }) {
    const { data: divergence, error } = await supabaseAdmin.from('divergencias_ordens').select('id, status').eq('id', id).maybeSingle();
    if (error || !divergence) return { data: null, error: erro('Divergência não encontrada.', 'DIVERGENCIA_NAO_ENCONTRADA') };
    if (['resolvida', 'encerrada_sem_solucao'].includes(divergence.status)) {
        return { data: null, error: erro('Não é possível alterar evidências após encerrar a divergência.', 'DIVERGENCIA_ENCERRADA') };
    }
    if (providenciaId) {
        const { data: step, error: stepError } = await supabaseAdmin.from('divergencia_providencias').select('id').eq('id', providenciaId).eq('divergencia_id', id).maybeSingle();
        if (stepError || !step) return { data: null, error: erro('Providência não encontrada.', 'PROVIDENCIA_NAO_ENCONTRADA') };
    }
    const upload = await enviarEvidencias(files, `divergencias/${id}/${providenciaId || 'geral'}`);
    if (upload.error) return upload;
    const rows = upload.data.map((file) => ({
        ...file, bucket: EVIDENCIA_BUCKET, divergencia_id: providenciaId ? null : id,
        providencia_id: providenciaId, enviado_por: usuarioId
    }));
    const { data, error: insertError } = await supabaseAdmin.from('ordem_evidencias').insert(rows).select('id, divergencia_id, providencia_id, nome_arquivo, content_type, tamanho_bytes, created_at');
    if (insertError) {
        await removerEvidenciasSemRegistro(upload.data.map((file) => file.storage_path));
        return { data: null, error: erro('Não foi possível vincular os anexos à divergência.', 'ERRO_PERSISTENCIA') };
    }
    return { data: data || [], error: null };
}

export async function alterarImpedimento({ id, impeditiva, justificativa, usuarioId }) {
    const { data, error } = await supabaseAdmin.rpc('alterar_impedimento_divergencia', {
        p_divergencia_id: id, p_impeditiva: impeditiva, p_justificativa: justificativa, p_usuario_id: usuarioId
    });
    return normalizarRpc(data, error);
}

export async function corrigirOrdem({ id, campos, justificativa, usuarioId }) {
    const { data, error } = await supabaseAdmin.rpc('corrigir_ordem_por_divergencia', {
        p_divergencia_id: id, p_campos: campos, p_justificativa: justificativa, p_usuario_id: usuarioId
    });
    return normalizarRpc(data, error);
}

export async function substituirVoucher({ id, voucherId, justificativa, usuarioId }) {
    const { data, error } = await supabaseAdmin.rpc('substituir_voucher_por_divergencia', {
        p_divergencia_id: id, p_voucher_id: voucherId, p_justificativa: justificativa, p_usuario_id: usuarioId
    });
    return normalizarRpc(data, error);
}

export async function solicitarCancelamento({ id, motivo, usuarioId }) {
    const { data, error } = await supabaseAdmin.rpc('solicitar_cancelamento_por_divergencia', {
        p_divergencia_id: id, p_motivo: motivo, p_usuario_id: usuarioId
    });
    return normalizarRpc(data, error);
}

export async function listarSolicitacoesCancelamento() {
    const { data, error } = await supabaseAdmin.from('solicitacoes_cancelamento_ordem')
        .select('*').order('solicitado_em', { ascending: false }).limit(200);
    if (error) return { data: null, error: erro('Não foi possível listar as solicitações de cancelamento.', 'ERRO_CONSULTA') };
    return { data: data || [], error: null };
}

export async function decidirCancelamento({ id, aprovado, justificativa, usuarioId }) {
    const { data, error } = await supabaseAdmin.rpc('decidir_cancelamento_ordem', {
        p_solicitacao_id: id, p_aprovado: aprovado, p_justificativa: justificativa, p_usuario_id: usuarioId
    });
    return normalizarRpc(data, error);
}

export function validarArquivoDivergencia(file) {
    return Boolean(file && file.size <= 5 * 1024 * 1024);
}

export { erro as erroDivergencia };
