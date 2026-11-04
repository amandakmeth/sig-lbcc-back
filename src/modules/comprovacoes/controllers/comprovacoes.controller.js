import {
    finalizarOrdemTransporte,
    listarComprovacoesOF,
    listarUtilizacoesOT,
    obterUrlEvidencia,
    registrarComprovacaoOF,
    registrarUtilizacaoOT
} from '../services/comprovacoes.service.js';

function statusErro(error) {
    const codes = {
        OF_NAO_ENCONTRADA: 404,
        OT_NAO_ENCONTRADA: 404,
        VOUCHER_NAO_ENCONTRADO: 404,
        EVIDENCIA_NAO_ENCONTRADA: 404,
        DIVERGENCIA_IMPEDITIVA: 409,
        ENTREGA_INCOMPLETA: 409,
        OF_NAO_ELEGIVEL: 409,
        OT_NAO_ELEGIVEL: 409,
        OT_UTILIZACAO_PENDENTE: 409,
        VOUCHER_INVALIDADO: 409,
        VOUCHER_NAO_ENTREGUE: 409,
        ITEM_NAO_AUTORIZADO: 400,
        ITEM_INVALIDO: 400,
        ITEM_DUPLICADO: 400,
        EVIDENCIA_INVALIDA: 400,
        EVIDENCIAS_LIMITE: 400,
        FALHA_UPLOAD: 502,
        ERRO_CONSULTA: 500,
        ERRO_PERSISTENCIA: 500
    };
    return codes[error?.code] || 400;
}

function exigirOperador(req, res) {
    if (['admin', 'gestor', 'operador'].includes(req.user?.perfil)) return false;
    res.status(403).json({ erro: 'Apenas operador ou gestor pode registrar comprovações.' });
    return true;
}

export async function getComprovacoesOF(req, res) {
    if (exigirOperador(req, res)) return;
    const result = await listarComprovacoesOF(req.params.id);
    if (result.error) return res.status(statusErro(result.error)).json({ erro: result.error.message, codigo: result.error.code });
    return res.json(result.data);
}

export async function postComprovacaoOF(req, res) {
    if (exigirOperador(req, res)) return;
    let itens;
    try {
        itens = typeof req.body?.itens === 'string' ? JSON.parse(req.body.itens) : req.body?.itens;
    } catch {
        return res.status(400).json({ erro: 'A lista de itens da comprovação está inválida.', codigo: 'ITENS_INVALIDOS' });
    }
    const result = await registrarComprovacaoOF({
        ordemId: req.params.id,
        dataExecucao: req.body?.data_execucao,
        responsavelExecucaoNome: req.body?.responsavel_execucao_nome || null,
        observacoes: req.body?.observacoes || null,
        itens,
        evidencias: req.files || [],
        usuarioId: req.user?.id,
        idempotencyKey: req.get('Idempotency-Key') || req.body?.idempotency_key
    });
    if (result.error) {
        return res.status(statusErro(result.error)).json({ erro: result.error.message, codigo: result.error.code, detalhes: result.error.details });
    }
    if (result.data.kind === 'divergencia') {
        return res.status(409).json({
            erro: 'A comprovação excede o saldo autorizado e não foi contabilizada. O caso foi encaminhado ao RF_F13.',
            codigo: 'DIVERGENCIA_CRIADA',
            divergencia_id: result.data.id
        });
    }
    return res.status(result.data.repetida ? 200 : 201).json({ id: result.data.id, repetida: Boolean(result.data.repetida) });
}

export async function getUtilizacoesOT(req, res) {
    if (exigirOperador(req, res)) return;
    const result = await listarUtilizacoesOT(req.params.id);
    if (result.error) return res.status(statusErro(result.error)).json({ erro: result.error.message, codigo: result.error.code });
    return res.json(result.data);
}

export async function postUtilizacaoOT(req, res) {
    if (exigirOperador(req, res)) return;
    let date = req.body?.data_utilizacao;
    if (typeof date === 'string' && date.length === 16) date += ':00';
    if (typeof date === 'string' && !/(Z|[+-]\d{2}:?\d{2})$/i.test(date)) date += '-03:00';
    const result = await registrarUtilizacaoOT({
        ordemId: req.params.id,
        voucherId: req.body?.voucher_id,
        dataUtilizacao: date,
        posto: req.body?.posto_abastecimento,
        quantidade: req.body?.quantidade,
        evidencias: req.files || [],
        usuarioId: req.user?.id,
        idempotencyKey: req.get('Idempotency-Key') || req.body?.idempotency_key
    });
    if (result.error) {
        return res.status(statusErro(result.error)).json({ erro: result.error.message, codigo: result.error.code, detalhes: result.error.details });
    }
    if (result.data.kind === 'divergencia') {
        const message = result.data?.tipo === 'posto_divergente'
            ? 'O posto informado diverge do autorizado. O uso não foi contabilizado e o caso foi encaminhado ao RF_F13.'
            : 'A quantidade excede o saldo autorizado. O uso não foi contabilizado e o caso foi encaminhado ao RF_F13.';
        return res.status(409).json({ erro: message, codigo: 'DIVERGENCIA_CRIADA', divergencia_id: result.data.id });
    }
    return res.status(result.data.repetida ? 200 : 201).json({ id: result.data.id, repetida: Boolean(result.data.repetida) });
}

export async function postFinalizarOT(req, res) {
    if (!['admin', 'gestor', 'operador'].includes(req.user?.perfil)) {
        return res.status(403).json({ erro: 'Apenas operador ou gestor pode finalizar a OT.' });
    }
    const result = await finalizarOrdemTransporte({ ordemId: req.params.id, usuarioId: req.user.id });
    if (result.error) return res.status(statusErro(result.error)).json({ erro: result.error.message, codigo: result.error.code, divergencias: result.error.details?.divergencias });
    return res.json(result.data.ordem || { id: result.data.id, status: 'finalizada' });
}

export async function getUrlEvidencia(req, res) {
    if (exigirOperador(req, res)) return;
    const result = await obterUrlEvidencia(req.params.id);
    if (result.error) return res.status(statusErro(result.error)).json({ erro: result.error.message, codigo: result.error.code });
    return res.json(result.data);
}
