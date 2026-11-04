import { randomUUID } from 'node:crypto';
import path from 'node:path';

import supabaseAdmin from '../../../config/supabaseAdmin.js';

const BUCKET = 'ordem-evidencias';
const MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
]);

function erro(message, code = 'VALIDATION_ERROR', details = undefined) {
    return { message, code, ...(details ? { details } : {}) };
}

function contentTypeValido(file) {
    if (!MIME_TYPES.has(file?.mimetype) || !Buffer.isBuffer(file?.buffer)) return false;
    const bytes = file.buffer;
    if (file.mimetype === 'application/pdf') return bytes.subarray(0, 4).toString() === '%PDF';
    if (file.mimetype === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (file.mimetype === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    return file.mimetype === 'image/webp'
        && bytes.subarray(0, 4).toString() === 'RIFF'
        && bytes.subarray(8, 12).toString() === 'WEBP';
}

function nomeSeguro(file) {
    const nome = path.basename(file.originalname || 'evidencia');
    return nome.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 180) || 'evidencia';
}

async function enviarArquivos(files = [], pasta) {
    if (!Array.isArray(files) || files.length > 5) {
        return { data: null, error: erro('Anexe no máximo cinco evidências por registro.', 'EVIDENCIAS_LIMITE') };
    }
    const invalid = files.find((file) => !contentTypeValido(file) || file.size <= 0 || file.size > 5 * 1024 * 1024);
    if (invalid) {
        return { data: null, error: erro('Use arquivos PDF, JPEG, PNG ou WEBP de até 5 MB.', 'EVIDENCIA_INVALIDA') };
    }

    const uploaded = [];
    for (const file of files) {
        const filename = nomeSeguro(file);
        const ext = path.extname(filename).toLowerCase().slice(0, 12);
        const storagePath = `${pasta}/${randomUUID()}${ext}`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(storagePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });
        if (uploadError) {
            await limparArquivos(uploaded.map((item) => item.storage_path));
            return { data: null, error: erro('Não foi possível armazenar a evidência.', 'FALHA_UPLOAD') };
        }
        uploaded.push({
            storage_path: storagePath,
            nome_arquivo: filename,
            content_type: file.mimetype,
            tamanho_bytes: file.size
        });
    }
    return { data: uploaded, error: null };
}

async function limparArquivos(paths = []) {
    if (paths.length === 0) return;
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
    if (error) console.error('[comprovacoes] Falha ao limpar evidências sem referência:', error.message);
}

async function removerUploadSeSemRegistro(files, resultado) {
    if (resultado?.repetida) {
        await limparArquivos(files.map((file) => file.storage_path));
    }
}

function resultadoRpc(data, error) {
    if (error) return { data: null, error: erro(error.message || 'Não foi possível concluir a operação.', 'ERRO_PERSISTENCIA') };
    if (!data?.ok) return { data: null, error: erro(data?.message || 'Não foi possível concluir a operação.', data?.code || 'ERRO_PERSISTENCIA', data) };
    return { data, error: null };
}

function dataExecucaoValida(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function registrarComprovacaoOF({
    ordemId,
    dataExecucao,
    responsavelExecucaoNome = null,
    observacoes = null,
    itens,
    evidencias = [],
    usuarioId,
    idempotencyKey
}) {
    if (!ordemId || !usuarioId || !dataExecucaoValida(dataExecucao) || !idempotencyKey
        || idempotencyKey.length > 200 || !Array.isArray(itens) || itens.length === 0
        || (responsavelExecucaoNome && responsavelExecucaoNome.length > 150)
        || (observacoes && observacoes.length > 2000)) {
        return { data: null, error: erro('Informe a ordem, a data e ao menos um item com quantidade.', 'DADOS_OBRIGATORIOS') };
    }
    const upload = await enviarArquivos(evidencias, `solicitacoes/of/${ordemId}`);
    if (upload.error) return upload;

    const rpc = await supabaseAdmin.rpc('registrar_comprovacao_of', {
        p_ordem_id: ordemId,
        p_data_execucao: dataExecucao,
        p_responsavel_execucao_nome: responsavelExecucaoNome,
        p_observacoes: observacoes,
        p_itens: itens,
        p_evidencias: upload.data,
        p_usuario_id: usuarioId,
        p_idempotency_key: idempotencyKey
    });
    const resultado = resultadoRpc(rpc.data, rpc.error);
    if (resultado.error) await limparArquivos(upload.data.map((file) => file.storage_path));
    else await removerUploadSeSemRegistro(upload.data, resultado.data);
    return resultado;
}

export async function listarComprovacoesOF(ordemId) {
    if (!ordemId) return { data: null, error: erro('A OF é obrigatória.') };
    const [ordemResult, proofsResult] = await Promise.all([
        supabaseAdmin.from('ordem_fornecimento_itens')
            .select('id, descricao, quantidade_solicitada, quantidade_entregue, quantidade_entregue_legado, unidade')
            .eq('ordem_fornecimento_id', ordemId)
            .order('descricao', { ascending: true }),
        supabaseAdmin.from('comprovacoes_of')
            .select('*')
            .eq('ordem_fornecimento_id', ordemId)
            .order('created_at', { ascending: false })
    ]);
    if (ordemResult.error || proofsResult.error) {
        return { data: null, error: erro('Não foi possível consultar as comprovações da OF.', 'ERRO_CONSULTA') };
    }
    const proofs = proofsResult.data || [];
    const proofIds = proofs.map((item) => item.id);
    const [linesResult, evidencesResult] = proofIds.length
        ? await Promise.all([
            supabaseAdmin.from('comprovacoes_of_itens').select('*').in('comprovacao_id', proofIds),
            supabaseAdmin.from('ordem_evidencias').select('id, comprovacao_of_id, nome_arquivo, content_type, tamanho_bytes, created_at').in('comprovacao_of_id', proofIds)
        ])
        : [{ data: [], error: null }, { data: [], error: null }];
    if (linesResult.error || evidencesResult.error) {
        return { data: null, error: erro('Não foi possível carregar o histórico de comprovações.', 'ERRO_CONSULTA') };
    }

    const items = ordemResult.data || [];
    const totals = new Map(items.map((item) => [item.id, Number(item.quantidade_entregue_legado || 0)]));
    const linesByProof = new Map();
    for (const line of linesResult.data || []) {
        totals.set(line.ordem_fornecimento_item_id, (totals.get(line.ordem_fornecimento_item_id) || 0) + Number(line.quantidade));
        linesByProof.set(line.comprovacao_id, [...(linesByProof.get(line.comprovacao_id) || []), line]);
    }
    const evidenceByProof = new Map();
    for (const evidence of evidencesResult.data || []) {
        evidenceByProof.set(evidence.comprovacao_of_id, [...(evidenceByProof.get(evidence.comprovacao_of_id) || []), evidence]);
    }
    return {
        data: {
            itens: items.map((item) => {
                const comprovada = totals.get(item.id) || 0;
                const autorizada = Number(item.quantidade_solicitada || 0);
                return {
                    ...item,
                    quantidade_comprovada: comprovada,
                    saldo: Math.max(autorizada - comprovada, 0),
                    status_atendimento: comprovada <= 0 ? 'pendente' : comprovada + 0.0005 >= autorizada ? 'integral' : 'parcial'
                };
            }),
            comprovacoes: proofs.map((proof) => ({
                ...proof,
                itens: linesByProof.get(proof.id) || [],
                evidencias: evidenceByProof.get(proof.id) || []
            }))
        },
        error: null
    };
}

export async function registrarUtilizacaoOT({
    ordemId,
    voucherId,
    dataUtilizacao,
    posto,
    quantidade,
    evidencias = [],
    usuarioId,
    idempotencyKey
}) {
    const amount = Number(quantidade);
    if (!ordemId || !voucherId || !usuarioId || !dataUtilizacao || !idempotencyKey || idempotencyKey.length > 200
        || !Number.isFinite(amount) || amount <= 0 || amount > 999999999.999
        || Math.abs(amount * 1000 - Math.round(amount * 1000)) > 1e-8
        || typeof posto !== 'string' || !posto.trim() || posto.trim().length > 200) {
        return { data: null, error: erro('Informe voucher, data, posto e uma quantidade positiva.', 'DADOS_INVALIDOS') };
    }
    const date = new Date(dataUtilizacao);
    if (Number.isNaN(date.getTime())) return { data: null, error: erro('Informe uma data de utilização válida.', 'DATA_INVALIDA') };
    const upload = await enviarArquivos(evidencias, `solicitacoes/ot/${ordemId}`);
    if (upload.error) return upload;
    const rpc = await supabaseAdmin.rpc('registrar_utilizacao_voucher_ot', {
        p_ordem_id: ordemId,
        p_voucher_id: voucherId,
        p_data_utilizacao: date.toISOString(),
        p_posto: posto.trim(),
        p_quantidade: amount,
        p_evidencias: upload.data,
        p_usuario_id: usuarioId,
        p_idempotency_key: idempotencyKey
    });
    const resultado = resultadoRpc(rpc.data, rpc.error);
    if (resultado.error) await limparArquivos(upload.data.map((file) => file.storage_path));
    else await removerUploadSeSemRegistro(upload.data, resultado.data);
    return resultado;
}

export async function listarUtilizacoesOT(ordemId) {
    if (!ordemId) return { data: null, error: erro('A OT é obrigatória.') };
    const { data, error } = await supabaseAdmin.from('utilizacoes_voucher_ot')
        .select('*').eq('ordem_transporte_id', ordemId).order('data_utilizacao', { ascending: false });
    if (error) return { data: null, error: erro('Não foi possível consultar as utilizações da OT.', 'ERRO_CONSULTA') };
    const ids = (data || []).map((item) => item.id);
    const [evidencesResult, vouchersResult] = ids.length
        ? await Promise.all([
            supabaseAdmin.from('ordem_evidencias').select('id, utilizacao_ot_id, nome_arquivo, content_type, tamanho_bytes, created_at').in('utilizacao_ot_id', ids),
            supabaseAdmin.from('ordem_transporte_vouchers').select('id, numero_via, tipo_via, codigo, invalidado_em').eq('ordem_transporte_id', ordemId)
        ])
        : [{ data: [], error: null }, await supabaseAdmin.from('ordem_transporte_vouchers').select('id, numero_via, tipo_via, codigo, invalidado_em').eq('ordem_transporte_id', ordemId)];
    if (evidencesResult.error || vouchersResult.error) return { data: null, error: erro('Não foi possível carregar os detalhes da utilização.', 'ERRO_CONSULTA') };
    const evidenceMap = new Map();
    for (const file of evidencesResult.data || []) evidenceMap.set(file.utilizacao_ot_id, [...(evidenceMap.get(file.utilizacao_ot_id) || []), file]);
    const vouchers = new Map((vouchersResult.data || []).map((voucher) => [voucher.id, voucher]));
    return {
        data: (data || []).map((usage) => ({ ...usage, voucher: vouchers.get(usage.voucher_id) || null, evidencias: evidenceMap.get(usage.id) || [] })),
        error: null
    };
}

export async function obterUrlEvidencia(id) {
    const { data: evidence, error } = await supabaseAdmin.from('ordem_evidencias')
        .select('storage_path, bucket').eq('id', id).maybeSingle();
    if (error || !evidence) return { data: null, error: erro('Evidência não encontrada.', 'EVIDENCIA_NAO_ENCONTRADA') };
    const { data, error: urlError } = await supabaseAdmin.storage
        .from(evidence.bucket).createSignedUrl(evidence.storage_path, 60);
    if (urlError || !data?.signedUrl) return { data: null, error: erro('Não foi possível liberar o acesso à evidência.', 'EVIDENCIA_INDISPONIVEL') };
    return { data: { url: data.signedUrl }, error: null };
}

export async function finalizarOrdemTransporte({ ordemId, usuarioId }) {
    const { data, error } = await supabaseAdmin.rpc('finalizar_ordem_transporte_com_divergencias', {
        p_ordem_id: ordemId,
        p_usuario_id: usuarioId
    });
    return resultadoRpc(data, error);
}

export const EVIDENCIA_BUCKET = BUCKET;
export const enviarEvidencias = enviarArquivos;
export const removerEvidenciasSemRegistro = limparArquivos;
export { erro as erroComprovacao };
