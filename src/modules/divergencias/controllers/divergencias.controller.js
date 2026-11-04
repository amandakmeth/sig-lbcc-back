import {
    alterarImpedimento,
    anexarEvidenciasDivergencia,
    buscarDivergencia,
    corrigirOrdem,
    criarDivergencia,
    decidirCancelamento,
    listarDivergencias,
    listarSolicitacoesCancelamento,
    registrarProvidencia,
    solicitarCancelamento,
    substituirVoucher,
    transicionarDivergencia
} from '../services/divergencias.service.js';

const perfisOperacionais = ['admin', 'gestor', 'operador'];
const perfisGestores = ['admin', 'gestor'];

function statusErro(error) {
    const known = {
        DIVERGENCIA_NAO_ENCONTRADA: 404,
        ORDEM_NAO_ENCONTRADA: 404,
        PROVIDENCIA_NAO_ENCONTRADA: 404,
        CANCELAMENTO_NAO_ENCONTRADO: 404,
        TRANSICAO_INVALIDA: 409,
        DIVERGENCIA_ENCERRADA: 409,
        ATENDIMENTO_PENDENTE: 409,
        VOUCHER_SUBSTITUTO_PENDENTE: 409,
        DIVERGENCIA_NAO_COMPATIVEL: 409,
        CANCELAMENTO_PENDENTE: 409,
        CANCELAMENTO_JA_DECIDIDO: 409,
        ORDEM_NAO_CANCELAVEL: 409,
        OT_NAO_PENDENTE: 409,
        OT_NAO_PERMITE_SUBSTITUICAO: 409,
        CORRECAO_NAO_PERMITIDA: 409,
        VOUCHER_NAO_ATIVO: 409,
        TIPO_INVALIDO: 400,
        CAMPO_NAO_CORRIGIVEL: 400,
        CAMPO_INVALIDO: 400,
        QUANTIDADE_INVALIDA: 400,
        JUSTIFICATIVA_OBRIGATORIA: 400,
        COMPROVACAO_OBRIGATORIA: 400,
        DADOS_OBRIGATORIOS: 400,
        ERRO_CONSULTA: 500,
        ERRO_PERSISTENCIA: 500
    };
    return known[error?.code] || 400;
}

function falha(res, error) {
    return res.status(statusErro(error)).json({
        erro: error.message,
        codigo: error.code,
        detalhes: error.details
    });
}

function exigirOperador(req, res) {
    if (perfisOperacionais.includes(req.user?.perfil)) return false;
    res.status(403).json({ erro: 'Apenas operador ou gestor pode executar esta ação.' });
    return true;
}

function exigirLeituraOperacional(req, res) {
    if (perfisOperacionais.includes(req.user?.perfil)) return false;
    res.status(403).json({ erro: 'Apenas operador ou gestor pode consultar divergências.' });
    return true;
}

function exigirGestor(req, res) {
    if (perfisGestores.includes(req.user?.perfil)) return false;
    res.status(403).json({ erro: 'Apenas gestor pode executar esta ação.' });
    return true;
}

export async function getDivergencias(req, res) {
    if (exigirLeituraOperacional(req, res)) return;
    const filters = {
        tipo_ordem: ['OF', 'OT'].includes(req.query.tipo_ordem) ? req.query.tipo_ordem : undefined,
        ordem_id: req.query.ordem_id,
        tipo: req.query.tipo,
        status: req.query.status,
        ...(req.query.impeditiva === 'true' ? { impeditiva: true } : {}),
        ...(req.query.impeditiva === 'false' ? { impeditiva: false } : {})
    };
    const result = await listarDivergencias(filters);
    if (result.error) return falha(res, result.error);
    return res.json(result.data);
}

export async function postDivergencia(req, res) {
    if (exigirOperador(req, res)) return;
    const result = await criarDivergencia({
        tipoOrdem: req.body?.tipo_ordem,
        ordemId: req.body?.ordem_id,
        tipo: req.body?.tipo,
        descricao: req.body?.descricao,
        impeditiva: req.body?.impeditiva,
        dados: req.body?.dados_detectados || {},
        usuarioId: req.user.id,
        idempotencyKey: req.get('Idempotency-Key') || req.body?.idempotency_key
    });
    if (result.error) return falha(res, result.error);
    return res.status(result.data.repetida ? 200 : 201).json(result.data);
}

export async function getDivergencia(req, res) {
    if (exigirLeituraOperacional(req, res)) return;
    const result = await buscarDivergencia(req.params.id);
    if (result.error) return falha(res, result.error);
    return res.json(result.data);
}

export async function patchStatusDivergencia(req, res) {
    if (exigirGestor(req, res)) return;
    const result = await transicionarDivergencia({
        id: req.params.id,
        status: req.body?.status,
        justificativa: req.body?.justificativa,
        comprovacao: req.body?.comprovacao,
        usuarioId: req.user.id
    });
    if (result.error) return falha(res, result.error);
    return res.json(result.data.divergencia);
}

export async function postProvidencia(req, res) {
    if (exigirOperador(req, res)) return;
    const result = await registrarProvidencia({
        id: req.params.id,
        descricao: req.body?.descricao,
        observacoes: req.body?.observacoes,
        responsavelId: req.body?.responsavel_id,
        previsaoRegularizacao: req.body?.previsao_regularizacao || null,
        usuarioId: req.user.id,
        files: req.files || []
    });
    if (result.error) return falha(res, result.error);
    return res.status(201).json(result.data);
}

export async function postEvidencias(req, res) {
    if (exigirOperador(req, res)) return;
    const result = await anexarEvidenciasDivergencia({
        id: req.params.id,
        providenciaId: req.params.providenciaId || null,
        usuarioId: req.user.id,
        files: req.files || []
    });
    if (result.error) return falha(res, result.error);
    return res.status(201).json(result.data);
}

export async function patchImpedimento(req, res) {
    if (exigirGestor(req, res)) return;
    const result = await alterarImpedimento({
        id: req.params.id,
        impeditiva: req.body?.impeditiva,
        justificativa: req.body?.justificativa,
        usuarioId: req.user.id
    });
    if (result.error) return falha(res, result.error);
    return res.json(result.data.divergencia);
}

export async function postCorrecao(req, res) {
    if (exigirGestor(req, res)) return;
    const result = await corrigirOrdem({
        id: req.params.id,
        campos: req.body?.campos,
        justificativa: req.body?.justificativa,
        usuarioId: req.user.id
    });
    if (result.error) return falha(res, result.error);
    return res.json(result.data);
}

export async function postSubstituirVoucher(req, res) {
    if (exigirGestor(req, res)) return;
    const result = await substituirVoucher({
        id: req.params.id,
        voucherId: req.body?.voucher_id,
        justificativa: req.body?.justificativa,
        usuarioId: req.user.id
    });
    if (result.error) return falha(res, result.error);
    return res.status(201).json(result.data);
}

export async function postSolicitarCancelamento(req, res) {
    if (exigirOperador(req, res)) return;
    const result = await solicitarCancelamento({ id: req.params.id, motivo: req.body?.motivo, usuarioId: req.user.id });
    if (result.error) return falha(res, result.error);
    return res.status(201).json(result.data.solicitacao);
}

export async function getSolicitacoesCancelamento(req, res) {
    if (exigirLeituraOperacional(req, res)) return;
    const result = await listarSolicitacoesCancelamento();
    if (result.error) return falha(res, result.error);
    return res.json(result.data);
}

export async function patchDecisaoCancelamento(req, res) {
    if (exigirGestor(req, res)) return;
    const result = await decidirCancelamento({
        id: req.params.id,
        aprovado: req.body?.aprovado,
        justificativa: req.body?.justificativa,
        usuarioId: req.user.id
    });
    if (result.error) return falha(res, result.error);
    return res.json(result.data.solicitacao);
}
