-- Comprovacoes RF_F12, gestao de divergencias RF_F13 e encaminhamento RF_F14.
-- As operacoes criticas sao RPCs para manter locks, saldos, estados e auditoria
-- na mesma transacao do Postgres.

ALTER TABLE public.ordem_fornecimento_itens
    ADD COLUMN IF NOT EXISTS quantidade_entregue_legado NUMERIC(12, 3);

UPDATE public.ordem_fornecimento_itens
   SET quantidade_entregue_legado = GREATEST(COALESCE(quantidade_entregue, 0), 0)
 WHERE quantidade_entregue_legado IS NULL;

ALTER TABLE public.ordem_fornecimento_itens
    ALTER COLUMN quantidade_entregue_legado SET DEFAULT 0,
    ALTER COLUMN quantidade_entregue_legado SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.comprovacoes_of (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ordem_fornecimento_id UUID NOT NULL
        REFERENCES public.ordens_fornecimento(id) ON DELETE RESTRICT,
    data_execucao DATE NOT NULL,
    responsavel_execucao_nome TEXT,
    observacoes TEXT,
    registrado_por UUID NOT NULL
        REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT comprovacoes_of_idempotency_unique
        UNIQUE (ordem_fornecimento_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.comprovacoes_of_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comprovacao_id UUID NOT NULL
        REFERENCES public.comprovacoes_of(id) ON DELETE RESTRICT,
    ordem_fornecimento_item_id UUID NOT NULL
        REFERENCES public.ordem_fornecimento_itens(id) ON DELETE RESTRICT,
    quantidade NUMERIC(12, 3) NOT NULL CHECK (quantidade > 0),
    CONSTRAINT comprovacao_of_item_unique
        UNIQUE (comprovacao_id, ordem_fornecimento_item_id)
);

CREATE INDEX IF NOT EXISTS idx_comprovacoes_of_ordem_data
    ON public.comprovacoes_of(ordem_fornecimento_id, data_execucao DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comprovacoes_of_itens_item
    ON public.comprovacoes_of_itens(ordem_fornecimento_item_id);

CREATE TABLE IF NOT EXISTS public.utilizacoes_voucher_ot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ordem_transporte_id UUID NOT NULL
        REFERENCES public.ordens_transporte(id) ON DELETE RESTRICT,
    voucher_id UUID NOT NULL
        REFERENCES public.ordem_transporte_vouchers(id) ON DELETE RESTRICT,
    data_utilizacao TIMESTAMPTZ NOT NULL,
    posto_abastecimento TEXT NOT NULL CHECK (length(trim(posto_abastecimento)) > 0),
    quantidade NUMERIC(12, 3) NOT NULL CHECK (quantidade > 0),
    registrado_por UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT utilizacao_voucher_ot_idempotency_unique
        UNIQUE (ordem_transporte_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_utilizacoes_voucher_ot_ordem_data
    ON public.utilizacoes_voucher_ot(ordem_transporte_id, data_utilizacao DESC);
CREATE INDEX IF NOT EXISTS idx_utilizacoes_voucher_ot_voucher
    ON public.utilizacoes_voucher_ot(voucher_id);

CREATE TABLE IF NOT EXISTS public.divergencias_ordens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ordem_fornecimento_id UUID REFERENCES public.ordens_fornecimento(id) ON DELETE RESTRICT,
    ordem_transporte_id UUID REFERENCES public.ordens_transporte(id) ON DELETE RESTRICT,
    tipo TEXT NOT NULL CHECK (tipo IN (
        'erro_administrativo', 'fornecimento_parcial', 'atraso_pendencia',
        'voucher_perdido_recusado', 'execucao_inviavel', 'quantidade_excedente',
        'posto_divergente', 'outro'
    )),
    descricao TEXT NOT NULL CHECK (length(trim(descricao)) > 0),
    dados_detectados JSONB NOT NULL DEFAULT '{}'::jsonb,
    identificado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    registrado_por UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    impeditiva BOOLEAN NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberta'
        CHECK (status IN ('aberta', 'em_tratamento', 'resolvida', 'encerrada_sem_solucao')),
    idempotency_key TEXT UNIQUE,
    resolucao_comprovacao TEXT,
    resolucao_justificativa TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT divergencia_exatamente_uma_ordem CHECK (
        (ordem_fornecimento_id IS NOT NULL AND ordem_transporte_id IS NULL)
        OR (ordem_fornecimento_id IS NULL AND ordem_transporte_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_divergencias_of_status
    ON public.divergencias_ordens(ordem_fornecimento_id, status, impeditiva)
    WHERE ordem_fornecimento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_divergencias_ot_status
    ON public.divergencias_ordens(ordem_transporte_id, status, impeditiva)
    WHERE ordem_transporte_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_divergencias_fila
    ON public.divergencias_ordens(status, impeditiva DESC, identificado_em DESC);

CREATE TABLE IF NOT EXISTS public.divergencia_eventos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    divergencia_id UUID NOT NULL
        REFERENCES public.divergencias_ordens(id) ON DELETE RESTRICT,
    acao TEXT NOT NULL,
    status_anterior TEXT,
    status_novo TEXT,
    justificativa TEXT,
    dados JSONB NOT NULL DEFAULT '{}'::jsonb,
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.divergencia_providencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    divergencia_id UUID NOT NULL
        REFERENCES public.divergencias_ordens(id) ON DELETE RESTRICT,
    descricao TEXT NOT NULL CHECK (length(trim(descricao)) > 0),
    observacoes TEXT,
    responsavel_id UUID REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    registrado_por UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    data_providencia TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    previsao_regularizacao TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_divergencia_eventos_ordem
    ON public.divergencia_eventos(divergencia_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_divergencia_providencias_ordem
    ON public.divergencia_providencias(divergencia_id, data_providencia DESC);
CREATE INDEX IF NOT EXISTS idx_divergencia_providencias_responsavel
    ON public.divergencia_providencias(responsavel_id)
    WHERE responsavel_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ordem_evidencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comprovacao_of_id UUID REFERENCES public.comprovacoes_of(id) ON DELETE RESTRICT,
    utilizacao_ot_id UUID REFERENCES public.utilizacoes_voucher_ot(id) ON DELETE RESTRICT,
    divergencia_id UUID REFERENCES public.divergencias_ordens(id) ON DELETE RESTRICT,
    providencia_id UUID REFERENCES public.divergencia_providencias(id) ON DELETE RESTRICT,
    bucket TEXT NOT NULL DEFAULT 'ordem-evidencias',
    storage_path TEXT NOT NULL UNIQUE,
    nome_arquivo TEXT NOT NULL,
    content_type TEXT NOT NULL,
    tamanho_bytes BIGINT NOT NULL CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 5242880),
    enviado_por UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT evidencia_exatamente_uma_origem CHECK (
        num_nonnulls(comprovacao_of_id, utilizacao_ot_id, divergencia_id, providencia_id) = 1
    )
);

CREATE INDEX IF NOT EXISTS idx_ordem_evidencias_comprovacao
    ON public.ordem_evidencias(comprovacao_of_id) WHERE comprovacao_of_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ordem_evidencias_utilizacao
    ON public.ordem_evidencias(utilizacao_ot_id) WHERE utilizacao_ot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ordem_evidencias_divergencia
    ON public.ordem_evidencias(divergencia_id) WHERE divergencia_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ordem_evidencias_providencia
    ON public.ordem_evidencias(providencia_id) WHERE providencia_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.solicitacoes_cancelamento_ordem (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    divergencia_id UUID NOT NULL REFERENCES public.divergencias_ordens(id) ON DELETE RESTRICT,
    ordem_fornecimento_id UUID REFERENCES public.ordens_fornecimento(id) ON DELETE RESTRICT,
    ordem_transporte_id UUID REFERENCES public.ordens_transporte(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'solicitada'
        CHECK (status IN ('solicitada', 'aprovada', 'recusada')),
    motivo TEXT NOT NULL CHECK (length(trim(motivo)) > 0),
    justificativa_decisao TEXT,
    solicitado_por UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    decidido_por UUID REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    solicitado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decidido_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cancelamento_exatamente_uma_ordem CHECK (
        (ordem_fornecimento_id IS NOT NULL AND ordem_transporte_id IS NULL)
        OR (ordem_fornecimento_id IS NULL AND ordem_transporte_id IS NOT NULL)
    ),
    CONSTRAINT cancelamento_decisao_completa CHECK (
        (status = 'solicitada' AND decidido_por IS NULL AND decidido_em IS NULL)
        OR (status IN ('aprovada', 'recusada') AND decidido_por IS NOT NULL AND decidido_em IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cancelamento_ordem_pendente_of
    ON public.solicitacoes_cancelamento_ordem(ordem_fornecimento_id)
    WHERE status = 'solicitada' AND ordem_fornecimento_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cancelamento_ordem_pendente_ot
    ON public.solicitacoes_cancelamento_ordem(ordem_transporte_id)
    WHERE status = 'solicitada' AND ordem_transporte_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cancelamentos_divergencia
    ON public.solicitacoes_cancelamento_ordem(divergencia_id, solicitado_em DESC);

ALTER TABLE public.ordem_transporte_vouchers
    ADD COLUMN IF NOT EXISTS invalidado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS invalidado_por UUID REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS motivo_invalidacao TEXT,
    ADD COLUMN IF NOT EXISTS substitui_voucher_id UUID
        REFERENCES public.ordem_transporte_vouchers(id) ON DELETE RESTRICT;

ALTER TABLE public.ordem_transporte_vouchers
    DROP CONSTRAINT IF EXISTS ordem_transporte_voucher_invalidacao_check;
ALTER TABLE public.ordem_transporte_vouchers
    ADD CONSTRAINT ordem_transporte_voucher_invalidacao_check CHECK (
        (invalidado_em IS NULL AND invalidado_por IS NULL AND motivo_invalidacao IS NULL)
        OR (invalidado_em IS NOT NULL AND invalidado_por IS NOT NULL AND length(trim(motivo_invalidacao)) > 0)
    );

CREATE INDEX IF NOT EXISTS idx_voucher_substituido
    ON public.ordem_transporte_vouchers(substitui_voucher_id)
    WHERE substitui_voucher_id IS NOT NULL;

-- Uma via invalidada pela resolução RF_F13 não pode ser entregue pelo fluxo
-- legado de RF_F11, mesmo que o cliente ainda esteja com a tela aberta.
CREATE OR REPLACE FUNCTION public.registrar_entrega_voucher_transporte(
    p_ordem_id UUID,
    p_voucher_id UUID,
    p_entregue_por UUID,
    p_destinatario TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
    v_ordem public.ordens_transporte%ROWTYPE;
    v_voucher public.ordem_transporte_vouchers%ROWTYPE;
BEGIN
    IF p_ordem_id IS NULL OR p_voucher_id IS NULL OR p_entregue_por IS NULL THEN
        RAISE EXCEPTION 'DADOS_OBRIGATORIOS';
    END IF;
    IF p_destinatario IS NULL OR length(trim(p_destinatario)) = 0 THEN
        RAISE EXCEPTION 'DESTINATARIO_OBRIGATORIO';
    END IF;
    SELECT * INTO v_ordem FROM public.ordens_transporte WHERE id = p_ordem_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'OT_NAO_ENCONTRADA'; END IF;
    SELECT * INTO v_voucher FROM public.ordem_transporte_vouchers
     WHERE id = p_voucher_id AND ordem_transporte_id = p_ordem_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VOUCHER_NAO_ENCONTRADO'; END IF;
    IF v_voucher.invalidado_em IS NOT NULL THEN RAISE EXCEPTION 'VOUCHER_INVALIDADO'; END IF;
    IF v_ordem.status NOT IN ('emitida', 'entregue') THEN
        RAISE EXCEPTION 'OT_NAO_PODE_SER_ENTREGUE';
    END IF;
    IF v_ordem.status = 'entregue' AND v_voucher.tipo_via <> 'segunda_via' THEN
        RAISE EXCEPTION 'OT_NAO_PODE_SER_ENTREGUE';
    END IF;
    IF v_ordem.validade_ate < (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
        RAISE EXCEPTION 'OT_VENCIDA';
    END IF;
    IF v_voucher.entregue_em IS NOT NULL THEN RAISE EXCEPTION 'VOUCHER_JA_ENTREGUE'; END IF;
    UPDATE public.ordem_transporte_vouchers
       SET entregue_em = NOW(), entregue_por = p_entregue_por, destinatario = trim(p_destinatario)
     WHERE id = p_voucher_id RETURNING * INTO v_voucher;
    IF v_ordem.status = 'emitida' THEN
        UPDATE public.ordens_transporte SET status = 'entregue', updated_at = NOW()
         WHERE id = p_ordem_id RETURNING * INTO v_ordem;
    END IF;
    RETURN jsonb_build_object('ordem', to_jsonb(v_ordem), 'voucher', to_jsonb(v_voucher));
END;
$function$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'ordem-evidencias',
    'ordem-evidencias',
    false,
    5242880,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.comprovacoes_of ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comprovacoes_of_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utilizacoes_voucher_ot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.divergencias_ordens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.divergencia_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.divergencia_providencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordem_evidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_cancelamento_ordem ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.comprovacoes_of, public.comprovacoes_of_itens,
    public.utilizacoes_voucher_ot, public.divergencias_ordens,
    public.divergencia_eventos, public.divergencia_providencias,
    public.ordem_evidencias, public.solicitacoes_cancelamento_ordem
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON public.comprovacoes_of, public.comprovacoes_of_itens,
    public.utilizacoes_voucher_ot, public.divergencias_ordens,
    public.divergencia_eventos, public.divergencia_providencias,
    public.ordem_evidencias, public.solicitacoes_cancelamento_ordem TO service_role;
GRANT UPDATE ON public.divergencias_ordens, public.solicitacoes_cancelamento_ordem,
    public.ordem_transporte_vouchers TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_comprovacao_of(
    p_ordem_id UUID,
    p_data_execucao DATE,
    p_responsavel_execucao_nome TEXT,
    p_observacoes TEXT,
    p_itens JSONB,
    p_evidencias JSONB,
    p_usuario_id UUID,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_ordem public.ordens_fornecimento%ROWTYPE;
    v_comprovacao public.comprovacoes_of%ROWTYPE;
    v_item JSONB;
    v_item_id UUID;
    v_quantidade NUMERIC(12, 3);
    v_autorizada NUMERIC(12, 3);
    v_comprovada NUMERIC(12, 3);
    v_itens JSONB := '[]'::jsonb;
    v_excedeu BOOLEAN := false;
    v_divergencia public.divergencias_ordens%ROWTYPE;
    v_evidencia JSONB;
    v_sum INTEGER;
BEGIN
    IF p_ordem_id IS NULL OR p_data_execucao IS NULL OR p_usuario_id IS NULL
       OR COALESCE(trim(p_idempotency_key), '') = '' OR length(p_idempotency_key) > 200 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DADOS_OBRIGATORIOS', 'message', 'Informe ordem, data, usuário e chave da operação.');
    END IF;
    IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ITENS_OBRIGATORIOS', 'message', 'A lista de itens da comprovação é inválida.');
    END IF;
    IF jsonb_array_length(p_itens) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ITENS_OBRIGATORIOS', 'message', 'Selecione ao menos um item da ordem.');
    END IF;
    IF jsonb_typeof(COALESCE(p_evidencias, '[]'::jsonb)) <> 'array' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'EVIDENCIAS_INVALIDAS', 'message', 'A lista de evidências é inválida.');
    END IF;

    SELECT * INTO v_ordem
      FROM public.ordens_fornecimento
     WHERE id = p_ordem_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OF_NAO_ENCONTRADA', 'message', 'Ordem de Fornecimento não encontrada.');
    END IF;
    IF v_ordem.status IN ('cancelada', 'finalizada') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OF_NAO_ELEGIVEL', 'message', 'A ordem cancelada ou finalizada não aceita novas comprovações.');
    END IF;
    IF v_ordem.status NOT IN ('enviada', 'em_entrega', 'entregue') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OF_NAO_ELEGIVEL', 'message', 'A situação atual da OF não permite comprovar execução.');
    END IF;

    SELECT * INTO v_comprovacao
      FROM public.comprovacoes_of
     WHERE ordem_fornecimento_id = p_ordem_id
       AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
        RETURN jsonb_build_object('ok', true, 'kind', 'comprovacao', 'repetida', true, 'id', v_comprovacao.id);
    END IF;
    SELECT * INTO v_divergencia
      FROM public.divergencias_ordens
     WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        RETURN jsonb_build_object('ok', true, 'kind', 'divergencia', 'repetida', true, 'id', v_divergencia.id);
    END IF;

    IF EXISTS (
        SELECT 1
          FROM jsonb_array_elements(p_itens) AS x(value)
         WHERE jsonb_typeof(x.value) <> 'object'
            OR COALESCE(x.value->>'item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            OR CASE
                WHEN COALESCE(x.value->>'quantidade', '') ~ '^[0-9]+([.][0-9]{1,3})?$'
                    THEN (x.value->>'quantidade')::NUMERIC <= 0
                ELSE true
            END
    ) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ITEM_INVALIDO', 'message', 'Cada quantidade deve ser um número positivo com até três casas decimais.');
    END IF;

    SELECT count(*), count(DISTINCT value->>'item_id')
      INTO v_sum, v_autorizada
      FROM jsonb_array_elements(p_itens);
    IF v_sum <> v_autorizada THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ITEM_DUPLICADO', 'message', 'A mesma linha da OF não pode aparecer duas vezes na comprovação.');
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
    LOOP
        v_item_id := (v_item->>'item_id')::UUID;
        v_quantidade := (v_item->>'quantidade')::NUMERIC;
        SELECT i.quantidade_solicitada,
               COALESCE(i.quantidade_entregue_legado, 0)
               + COALESCE((
                    SELECT sum(ci.quantidade)
                      FROM public.comprovacoes_of_itens ci
                      JOIN public.comprovacoes_of c ON c.id = ci.comprovacao_id
                     WHERE ci.ordem_fornecimento_item_id = i.id
                       AND c.ordem_fornecimento_id = p_ordem_id
               ), 0)
          INTO v_autorizada, v_comprovada
          FROM public.ordem_fornecimento_itens i
         WHERE i.id = v_item_id
           AND i.ordem_fornecimento_id = p_ordem_id;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'code', 'ITEM_NAO_AUTORIZADO', 'message', 'Um item informado não pertence a esta OF.');
        END IF;
        v_itens := v_itens || jsonb_build_array(jsonb_build_object(
            'item_id', v_item_id,
            'quantidade', v_quantidade,
            'quantidade_autorizada', v_autorizada,
            'quantidade_ja_comprovada', v_comprovada,
            'saldo', GREATEST(v_autorizada - v_comprovada, 0)
        ));
        IF v_comprovada + v_quantidade > v_autorizada THEN
            v_excedeu := true;
        END IF;
    END LOOP;

    IF v_excedeu THEN
        INSERT INTO public.divergencias_ordens (
            ordem_fornecimento_id, tipo, descricao, dados_detectados,
            registrado_por, impeditiva, status, idempotency_key
        ) VALUES (
            p_ordem_id,
            'quantidade_excedente',
            'A quantidade informada excede o saldo autorizado da OF.',
            jsonb_build_object(
                'data_execucao', p_data_execucao,
                'responsavel_execucao_nome', p_responsavel_execucao_nome,
                'observacoes', p_observacoes,
                'itens_solicitados', p_itens,
                'saldos_atuais', v_itens
            ),
            p_usuario_id,
            true,
            'aberta',
            p_idempotency_key
        ) RETURNING * INTO v_divergencia;
        INSERT INTO public.divergencia_eventos (divergencia_id, acao, status_novo, dados, usuario_id)
        VALUES (v_divergencia.id, 'DIVERGENCIA_CRIADA_AUTOMATICAMENTE', 'aberta', v_divergencia.dados_detectados, p_usuario_id);
        FOR v_evidencia IN SELECT value FROM jsonb_array_elements(COALESCE(p_evidencias, '[]'::jsonb))
        LOOP
            INSERT INTO public.ordem_evidencias (
                divergencia_id, storage_path, nome_arquivo, content_type, tamanho_bytes, enviado_por
            ) VALUES (
                v_divergencia.id,
                v_evidencia->>'storage_path',
                v_evidencia->>'nome_arquivo',
                v_evidencia->>'content_type',
                (v_evidencia->>'tamanho_bytes')::BIGINT,
                p_usuario_id
            );
        END LOOP;
        INSERT INTO public.auditoria_eventos (entidade_tipo, entidade_id, acao, usuario_id, dados, idempotency_key)
        VALUES ('divergencia_ordem', v_divergencia.id, 'DIVERGENCIA_CRIADA_POR_EXCESSO_OF', p_usuario_id, v_divergencia.dados_detectados, 'divergencia:' || v_divergencia.id::TEXT);
        INSERT INTO public.historico_pacientes (paciente_id, usuario_id, tipo_evento, descricao, referencia_id)
        VALUES (v_ordem.paciente_id, p_usuario_id, 'ORDEM_DIVERGENCIA', 'Divergência impeditiva por quantidade excedente na OF ' || v_ordem.numero || '.', v_divergencia.id);
        RETURN jsonb_build_object('ok', true, 'kind', 'divergencia', 'id', v_divergencia.id, 'itens', v_itens);
    END IF;

    INSERT INTO public.comprovacoes_of (
        ordem_fornecimento_id, data_execucao, responsavel_execucao_nome,
        observacoes, registrado_por, idempotency_key
    ) VALUES (
        p_ordem_id, p_data_execucao, NULLIF(trim(p_responsavel_execucao_nome), ''),
        NULLIF(trim(p_observacoes), ''), p_usuario_id, p_idempotency_key
    ) RETURNING * INTO v_comprovacao;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
    LOOP
        INSERT INTO public.comprovacoes_of_itens (comprovacao_id, ordem_fornecimento_item_id, quantidade)
        VALUES (v_comprovacao.id, (v_item->>'item_id')::UUID, (v_item->>'quantidade')::NUMERIC);
    END LOOP;

    UPDATE public.ordem_fornecimento_itens i
       SET quantidade_entregue = COALESCE(i.quantidade_entregue_legado, 0)
           + COALESCE((
                SELECT sum(ci.quantidade)
                  FROM public.comprovacoes_of_itens ci
                  JOIN public.comprovacoes_of c ON c.id = ci.comprovacao_id
                 WHERE ci.ordem_fornecimento_item_id = i.id
                   AND c.ordem_fornecimento_id = p_ordem_id
           ), 0)
     WHERE i.ordem_fornecimento_id = p_ordem_id
       AND i.id IN (SELECT (value->>'item_id')::UUID FROM jsonb_array_elements(p_itens));

    FOR v_evidencia IN SELECT value FROM jsonb_array_elements(COALESCE(p_evidencias, '[]'::jsonb))
    LOOP
        INSERT INTO public.ordem_evidencias (
            comprovacao_of_id, storage_path, nome_arquivo, content_type, tamanho_bytes, enviado_por
        ) VALUES (
            v_comprovacao.id,
            v_evidencia->>'storage_path',
            v_evidencia->>'nome_arquivo',
            v_evidencia->>'content_type',
            (v_evidencia->>'tamanho_bytes')::BIGINT,
            p_usuario_id
        );
    END LOOP;

    INSERT INTO public.auditoria_eventos (entidade_tipo, entidade_id, acao, usuario_id, dados, idempotency_key)
    VALUES ('comprovacao_of', v_comprovacao.id, 'OF_COMPROVACAO_REGISTRADA', p_usuario_id,
            jsonb_build_object('ordem_id', p_ordem_id, 'itens', p_itens), 'comprovacao-of:' || v_comprovacao.id::TEXT);
    INSERT INTO public.historico_pacientes (paciente_id, usuario_id, tipo_evento, descricao, referencia_id)
    VALUES (v_ordem.paciente_id, p_usuario_id, 'OF_COMPROVACAO_REGISTRADA',
            'Comprovação de execução registrada para a OF ' || v_ordem.numero || '.', v_comprovacao.id);
    RETURN jsonb_build_object('ok', true, 'kind', 'comprovacao', 'id', v_comprovacao.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_utilizacao_voucher_ot(
    p_ordem_id UUID,
    p_voucher_id UUID,
    p_data_utilizacao TIMESTAMPTZ,
    p_posto TEXT,
    p_quantidade NUMERIC,
    p_evidencias JSONB,
    p_usuario_id UUID,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_ordem public.ordens_transporte%ROWTYPE;
    v_voucher public.ordem_transporte_vouchers%ROWTYPE;
    v_utilizacao public.utilizacoes_voucher_ot%ROWTYPE;
    v_divergencia public.divergencias_ordens%ROWTYPE;
    v_total NUMERIC(12, 3);
    v_evidencia JSONB;
    v_tipo TEXT;
    v_descricao TEXT;
    v_detectado JSONB;
    v_status_anterior TEXT;
BEGIN
    IF p_ordem_id IS NULL OR p_voucher_id IS NULL OR p_data_utilizacao IS NULL
       OR p_usuario_id IS NULL OR COALESCE(trim(p_idempotency_key), '') = '' OR length(p_idempotency_key) > 200
       OR COALESCE(trim(p_posto), '') = '' OR p_quantidade IS NULL OR p_quantidade <= 0
       OR p_quantidade > 999999999.999 OR p_quantidade <> trunc(p_quantidade, 3) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DADOS_INVALIDOS', 'message', 'Informe voucher, data, posto e quantidade positiva.');
    END IF;
    IF jsonb_typeof(COALESCE(p_evidencias, '[]'::jsonb)) <> 'array' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'EVIDENCIAS_INVALIDAS', 'message', 'A lista de evidências é inválida.');
    END IF;

    SELECT * INTO v_ordem FROM public.ordens_transporte WHERE id = p_ordem_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OT_NAO_ENCONTRADA', 'message', 'Ordem de Transporte não encontrada.');
    END IF;
    IF v_ordem.status IN ('pendente', 'cancelada', 'finalizada', 'vencida') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OT_NAO_ELEGIVEL', 'message', 'A situação atual da OT não permite registrar utilização.');
    END IF;
    v_status_anterior := v_ordem.status;

    SELECT * INTO v_utilizacao FROM public.utilizacoes_voucher_ot
     WHERE ordem_transporte_id = p_ordem_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
        RETURN jsonb_build_object('ok', true, 'kind', 'utilizacao', 'repetida', true, 'id', v_utilizacao.id);
    END IF;
    SELECT * INTO v_divergencia FROM public.divergencias_ordens WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        RETURN jsonb_build_object('ok', true, 'kind', 'divergencia', 'repetida', true, 'id', v_divergencia.id);
    END IF;

    SELECT * INTO v_voucher FROM public.ordem_transporte_vouchers
     WHERE id = p_voucher_id AND ordem_transporte_id = p_ordem_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'VOUCHER_NAO_ENCONTRADO', 'message', 'O voucher não pertence a esta OT.');
    END IF;
    IF v_voucher.invalidado_em IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'VOUCHER_INVALIDADO', 'message', 'O voucher selecionado foi invalidado.');
    END IF;
    IF v_voucher.entregue_em IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'VOUCHER_NAO_ENTREGUE', 'message', 'A utilização só pode ser registrada para um voucher entregue.');
    END IF;

    v_total := COALESCE((SELECT sum(quantidade) FROM public.utilizacoes_voucher_ot WHERE ordem_transporte_id = p_ordem_id), 0);
    v_tipo := NULL;
    v_descricao := NULL;
    IF lower(trim(p_posto)) <> lower(trim(v_ordem.posto_abastecimento)) THEN
        v_tipo := 'posto_divergente';
        v_descricao := 'O posto informado não corresponde ao posto autorizado na OT.';
    ELSIF v_ordem.quantidade_autorizada IS NULL OR v_total + p_quantidade > v_ordem.quantidade_autorizada THEN
        v_tipo := 'quantidade_excedente';
        v_descricao := 'A quantidade abastecida excede o saldo autorizado da OT.';
    END IF;

    IF v_tipo IS NOT NULL THEN
        v_detectado := jsonb_build_object(
            'data_utilizacao', p_data_utilizacao,
            'voucher_id', p_voucher_id,
            'posto_informado', p_posto,
            'posto_autorizado', v_ordem.posto_abastecimento,
            'quantidade_solicitada', p_quantidade,
            'quantidade_ja_comprovada', v_total,
            'quantidade_autorizada', v_ordem.quantidade_autorizada
        );
        INSERT INTO public.divergencias_ordens (
            ordem_transporte_id, tipo, descricao, dados_detectados,
            registrado_por, impeditiva, status, idempotency_key
        ) VALUES (p_ordem_id, v_tipo, v_descricao, v_detectado, p_usuario_id, true, 'aberta', p_idempotency_key)
        RETURNING * INTO v_divergencia;
        INSERT INTO public.divergencia_eventos (divergencia_id, acao, status_novo, dados, usuario_id)
        VALUES (v_divergencia.id, 'DIVERGENCIA_CRIADA_AUTOMATICAMENTE', 'aberta', v_detectado, p_usuario_id);
        FOR v_evidencia IN SELECT value FROM jsonb_array_elements(COALESCE(p_evidencias, '[]'::jsonb))
        LOOP
            INSERT INTO public.ordem_evidencias (
                divergencia_id, storage_path, nome_arquivo, content_type, tamanho_bytes, enviado_por
            ) VALUES (
                v_divergencia.id, v_evidencia->>'storage_path', v_evidencia->>'nome_arquivo',
                v_evidencia->>'content_type', (v_evidencia->>'tamanho_bytes')::BIGINT, p_usuario_id
            );
        END LOOP;
        INSERT INTO public.auditoria_eventos (entidade_tipo, entidade_id, acao, usuario_id, dados, idempotency_key)
        VALUES ('divergencia_ordem', v_divergencia.id, 'DIVERGENCIA_CRIADA_POR_UTILIZACAO_OT', p_usuario_id, v_detectado, 'divergencia:' || v_divergencia.id::TEXT);
        INSERT INTO public.historico_pacientes (paciente_id, usuario_id, tipo_evento, descricao, referencia_id)
        VALUES (v_ordem.paciente_id, p_usuario_id, 'ORDEM_DIVERGENCIA', 'Divergência impeditiva identificada na OT ' || v_ordem.numero || '.', v_divergencia.id);
        RETURN jsonb_build_object('ok', true, 'kind', 'divergencia', 'id', v_divergencia.id, 'tipo', v_tipo);
    END IF;

    INSERT INTO public.utilizacoes_voucher_ot (
        ordem_transporte_id, voucher_id, data_utilizacao, posto_abastecimento,
        quantidade, registrado_por, idempotency_key
    ) VALUES (
        p_ordem_id, p_voucher_id, p_data_utilizacao, trim(p_posto),
        p_quantidade, p_usuario_id, p_idempotency_key
    ) RETURNING * INTO v_utilizacao;
    IF v_ordem.status = 'entregue' THEN
        UPDATE public.ordens_transporte
           SET status = 'utilizacao_comprovada', updated_at = NOW()
         WHERE id = p_ordem_id RETURNING * INTO v_ordem;
    END IF;
    FOR v_evidencia IN SELECT value FROM jsonb_array_elements(COALESCE(p_evidencias, '[]'::jsonb))
    LOOP
        INSERT INTO public.ordem_evidencias (
            utilizacao_ot_id, storage_path, nome_arquivo, content_type, tamanho_bytes, enviado_por
        ) VALUES (
            v_utilizacao.id, v_evidencia->>'storage_path', v_evidencia->>'nome_arquivo',
            v_evidencia->>'content_type', (v_evidencia->>'tamanho_bytes')::BIGINT, p_usuario_id
        );
    END LOOP;
    INSERT INTO public.auditoria_eventos (entidade_tipo, entidade_id, acao, usuario_id, dados, idempotency_key)
    VALUES ('utilizacao_voucher_ot', v_utilizacao.id, 'OT_UTILIZACAO_REGISTRADA', p_usuario_id,
            jsonb_build_object('ordem_id', p_ordem_id, 'voucher_id', p_voucher_id, 'quantidade', p_quantidade, 'posto', p_posto,
                'status_anterior', v_status_anterior, 'status_novo', v_ordem.status),
            'utilizacao-ot:' || v_utilizacao.id::TEXT);
    INSERT INTO public.historico_pacientes (paciente_id, usuario_id, tipo_evento, descricao, referencia_id)
    VALUES (v_ordem.paciente_id, p_usuario_id, 'OT_UTILIZACAO_REGISTRADA',
            'Utilização de voucher registrada para a OT ' || v_ordem.numero || '.', v_utilizacao.id);
    RETURN jsonb_build_object('ok', true, 'kind', 'utilizacao', 'id', v_utilizacao.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_ordem_fornecimento_com_divergencias(
    p_ordem_id UUID,
    p_usuario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_ordem public.ordens_fornecimento%ROWTYPE;
    v_bloqueios JSONB;
    v_itens JSONB;
BEGIN
    SELECT * INTO v_ordem FROM public.ordens_fornecimento WHERE id = p_ordem_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OF_NAO_ENCONTRADA', 'message', 'Ordem de Fornecimento não encontrada.');
    END IF;
    IF v_ordem.status = 'finalizada' THEN
        RETURN jsonb_build_object('ok', true, 'ja_finalizada', true);
    END IF;
    IF v_ordem.status NOT IN ('enviada', 'em_entrega', 'entregue') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OF_NAO_ELEGIVEL', 'message', 'A ordem de fornecimento não pode ser finalizada neste status.');
    END IF;
    SELECT jsonb_agg(jsonb_build_object(
        'item_id', i.id, 'descricao', i.descricao,
        'quantidade_solicitada', i.quantidade_solicitada,
        'quantidade_comprovada', i.quantidade_entregue,
        'saldo', GREATEST(i.quantidade_solicitada - i.quantidade_entregue, 0)
    )) INTO v_itens
      FROM public.ordem_fornecimento_itens i
     WHERE i.ordem_fornecimento_id = p_ordem_id
       AND abs(COALESCE(i.quantidade_solicitada, 0) - COALESCE(i.quantidade_entregue, 0)) > 0.0005;
    IF NOT EXISTS (SELECT 1 FROM public.ordem_fornecimento_itens WHERE ordem_fornecimento_id = p_ordem_id) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OF_SEM_ITENS', 'message', 'A ordem não pode ser finalizada sem itens cadastrados.');
    END IF;
    IF v_itens IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ENTREGA_INCOMPLETA', 'message', 'A ordem não pode ser finalizada: existem itens com saldo pendente.', 'itens_pendentes', v_itens);
    END IF;
    SELECT jsonb_agg(jsonb_build_object('id', d.id, 'tipo', d.tipo, 'descricao', d.descricao, 'status', d.status))
      INTO v_bloqueios
      FROM public.divergencias_ordens d
     WHERE d.ordem_fornecimento_id = p_ordem_id
       AND d.impeditiva = true
       AND d.status <> 'resolvida';
    IF v_bloqueios IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DIVERGENCIA_IMPEDITIVA', 'message', 'A finalização está bloqueada por divergência impeditiva não resolvida.', 'divergencias', v_bloqueios);
    END IF;
    UPDATE public.ordens_fornecimento
       SET status = 'finalizada', data_finalizacao = NOW(), atualizado_por = p_usuario_id, updated_at = NOW()
     WHERE id = p_ordem_id
     RETURNING * INTO v_ordem;
    RETURN jsonb_build_object('ok', true, 'ordem', to_jsonb(v_ordem));
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_ordem_transporte_com_divergencias(
    p_ordem_id UUID,
    p_usuario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_ordem public.ordens_transporte%ROWTYPE;
    v_bloqueios JSONB;
    v_total NUMERIC(12, 3);
BEGIN
    IF p_usuario_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DADOS_OBRIGATORIOS', 'message', 'O usuário responsável pela finalização é obrigatório.');
    END IF;
    SELECT * INTO v_ordem FROM public.ordens_transporte WHERE id = p_ordem_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OT_NAO_ENCONTRADA', 'message', 'Ordem de Transporte não encontrada.');
    END IF;
    IF v_ordem.status = 'finalizada' THEN
        RETURN jsonb_build_object('ok', true, 'ja_finalizada', true);
    END IF;
    IF v_ordem.status NOT IN ('utilizacao_comprovada') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OT_UTILIZACAO_PENDENTE', 'message', 'A OT precisa ter utilização comprovada antes da finalização.');
    END IF;
    SELECT COALESCE(sum(quantidade), 0) INTO v_total
      FROM public.utilizacoes_voucher_ot WHERE ordem_transporte_id = p_ordem_id;
    IF v_total <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OT_UTILIZACAO_PENDENTE', 'message', 'A OT precisa ter utilização comprovada antes da finalização.');
    END IF;
    SELECT jsonb_agg(jsonb_build_object('id', d.id, 'tipo', d.tipo, 'descricao', d.descricao, 'status', d.status))
      INTO v_bloqueios
      FROM public.divergencias_ordens d
     WHERE d.ordem_transporte_id = p_ordem_id
       AND d.impeditiva = true
       AND d.status <> 'resolvida';
    IF v_bloqueios IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DIVERGENCIA_IMPEDITIVA', 'message', 'A finalização está bloqueada por divergência impeditiva não resolvida.', 'divergencias', v_bloqueios);
    END IF;
    UPDATE public.ordens_transporte SET status = 'finalizada', updated_at = NOW()
     WHERE id = p_ordem_id RETURNING * INTO v_ordem;
    INSERT INTO public.auditoria_eventos (entidade_tipo, entidade_id, acao, usuario_id, dados, idempotency_key)
    VALUES ('ordem_transporte', v_ordem.id, 'OT_FINALIZADA', p_usuario_id,
            jsonb_build_object('status_anterior', 'utilizacao_comprovada', 'status_novo', 'finalizada', 'quantidade_utilizada', v_total),
            'ot:' || v_ordem.id::TEXT || ':finalizacao');
    RETURN jsonb_build_object('ok', true, 'ordem', to_jsonb(v_ordem), 'quantidade_utilizada', v_total);
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_evento_divergencia(
    p_divergencia_id UUID,
    p_acao TEXT,
    p_status_anterior TEXT,
    p_status_novo TEXT,
    p_justificativa TEXT,
    p_dados JSONB,
    p_usuario_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_paciente_id UUID;
    v_numero TEXT;
BEGIN
    SELECT CASE WHEN d.ordem_fornecimento_id IS NOT NULL THEN of.paciente_id ELSE ot.paciente_id END,
           CASE WHEN d.ordem_fornecimento_id IS NOT NULL THEN of.numero ELSE ot.numero END
      INTO v_paciente_id, v_numero
      FROM public.divergencias_ordens d
      LEFT JOIN public.ordens_fornecimento of ON of.id = d.ordem_fornecimento_id
      LEFT JOIN public.ordens_transporte ot ON ot.id = d.ordem_transporte_id
     WHERE d.id = p_divergencia_id;

    INSERT INTO public.divergencia_eventos (
        divergencia_id, acao, status_anterior, status_novo,
        justificativa, dados, usuario_id
    ) VALUES (
        p_divergencia_id, p_acao, p_status_anterior, p_status_novo,
        p_justificativa, COALESCE(p_dados, '{}'::jsonb), p_usuario_id
    );

    INSERT INTO public.auditoria_eventos (
        entidade_tipo, entidade_id, acao, usuario_id, dados
    ) VALUES (
        'divergencia_ordem', p_divergencia_id, p_acao, p_usuario_id,
        jsonb_build_object(
            'status_anterior', p_status_anterior,
            'status_novo', p_status_novo,
            'justificativa', p_justificativa,
            'dados', COALESCE(p_dados, '{}'::jsonb)
        )
    );

    IF v_paciente_id IS NOT NULL THEN
        INSERT INTO public.historico_pacientes (
            paciente_id, usuario_id, tipo_evento, descricao, referencia_id
        ) VALUES (
            v_paciente_id, p_usuario_id, 'ORDEM_DIVERGENCIA',
            'Divergência da ordem ' || COALESCE(v_numero, '') || ': ' || p_acao ||
                CASE WHEN COALESCE(trim(p_justificativa), '') <> '' THEN ' — ' || trim(p_justificativa) ELSE '' END,
            p_divergencia_id
        );
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_divergencia_ordem(
    p_tipo_ordem TEXT,
    p_ordem_id UUID,
    p_tipo TEXT,
    p_descricao TEXT,
    p_impeditiva BOOLEAN,
    p_dados JSONB,
    p_usuario_id UUID,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_divergencia public.divergencias_ordens%ROWTYPE;
    v_status TEXT;
BEGIN
    IF p_tipo_ordem IS NULL OR p_tipo IS NULL OR p_tipo_ordem NOT IN ('OF', 'OT') OR p_ordem_id IS NULL OR p_usuario_id IS NULL
       OR p_impeditiva IS NULL OR COALESCE(trim(p_descricao), '') = ''
       OR COALESCE(trim(p_idempotency_key), '') = '' OR length(p_idempotency_key) > 200 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DADOS_OBRIGATORIOS', 'message', 'Informe ordem, tipo, descrição, grau impeditivo, usuário e chave de operação.');
    END IF;
    IF p_tipo NOT IN (
        'erro_administrativo', 'fornecimento_parcial', 'atraso_pendencia',
        'voucher_perdido_recusado', 'execucao_inviavel', 'quantidade_excedente',
        'posto_divergente', 'outro'
    ) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'TIPO_INVALIDO', 'message', 'Tipo de divergência inválido.');
    END IF;
    SELECT * INTO v_divergencia FROM public.divergencias_ordens WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        RETURN jsonb_build_object('ok', true, 'repetida', true, 'id', v_divergencia.id);
    END IF;

    IF p_tipo_ordem = 'OF' THEN
        SELECT status INTO v_status FROM public.ordens_fornecimento WHERE id = p_ordem_id FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'code', 'ORDEM_NAO_ENCONTRADA', 'message', 'Ordem de Fornecimento não encontrada.');
        END IF;
        INSERT INTO public.divergencias_ordens (
            ordem_fornecimento_id, tipo, descricao, impeditiva, dados_detectados,
            registrado_por, status, idempotency_key
        ) VALUES (
            p_ordem_id, p_tipo, trim(p_descricao), p_impeditiva, COALESCE(p_dados, '{}'::jsonb),
            p_usuario_id, 'aberta', p_idempotency_key
        ) RETURNING * INTO v_divergencia;
    ELSE
        SELECT status INTO v_status FROM public.ordens_transporte WHERE id = p_ordem_id FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'code', 'ORDEM_NAO_ENCONTRADA', 'message', 'Ordem de Transporte não encontrada.');
        END IF;
        INSERT INTO public.divergencias_ordens (
            ordem_transporte_id, tipo, descricao, impeditiva, dados_detectados,
            registrado_por, status, idempotency_key
        ) VALUES (
            p_ordem_id, p_tipo, trim(p_descricao), p_impeditiva, COALESCE(p_dados, '{}'::jsonb),
            p_usuario_id, 'aberta', p_idempotency_key
        ) RETURNING * INTO v_divergencia;
    END IF;

    PERFORM public.registrar_evento_divergencia(
        v_divergencia.id, 'DIVERGENCIA_CRIADA', NULL, 'aberta', NULL,
        jsonb_build_object('tipo', p_tipo, 'impeditiva', p_impeditiva, 'dados_detectados', COALESCE(p_dados, '{}'::jsonb)),
        p_usuario_id
    );
    RETURN jsonb_build_object('ok', true, 'id', v_divergencia.id, 'divergencia', to_jsonb(v_divergencia));
EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_divergencia FROM public.divergencias_ordens WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
        RETURN jsonb_build_object('ok', true, 'repetida', true, 'id', v_divergencia.id);
    END IF;
    RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.transicionar_divergencia_ordem(
    p_divergencia_id UUID,
    p_novo_status TEXT,
    p_justificativa TEXT,
    p_comprovacao TEXT,
    p_usuario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_divergencia public.divergencias_ordens%ROWTYPE;
    v_pendente BOOLEAN;
    v_ativo BOOLEAN;
BEGIN
    IF p_divergencia_id IS NULL OR p_usuario_id IS NULL
       OR COALESCE(trim(p_justificativa), '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'JUSTIFICATIVA_OBRIGATORIA', 'message', 'Informe a justificativa da transição.');
    END IF;
    IF p_novo_status NOT IN ('em_tratamento', 'resolvida', 'encerrada_sem_solucao') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'TRANSICAO_INVALIDA', 'message', 'O novo estado informado é inválido.');
    END IF;
    SELECT * INTO v_divergencia FROM public.divergencias_ordens WHERE id = p_divergencia_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DIVERGENCIA_NAO_ENCONTRADA', 'message', 'Divergência não encontrada.');
    END IF;
    IF NOT ((v_divergencia.status = 'aberta' AND p_novo_status = 'em_tratamento')
         OR (v_divergencia.status = 'em_tratamento' AND p_novo_status IN ('resolvida', 'encerrada_sem_solucao'))) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'TRANSICAO_INVALIDA', 'message', 'A transição não é permitida a partir do estado atual.');
    END IF;
    IF p_novo_status = 'resolvida' AND COALESCE(trim(p_comprovacao), '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'COMPROVACAO_OBRIGATORIA', 'message', 'Descreva a comprovação da solução antes de resolver.');
    END IF;
    IF p_novo_status = 'resolvida' AND v_divergencia.tipo = 'fornecimento_parcial' THEN
        IF v_divergencia.ordem_fornecimento_id IS NOT NULL THEN
            SELECT EXISTS (
                SELECT 1 FROM public.ordem_fornecimento_itens i
                 WHERE i.ordem_fornecimento_id = v_divergencia.ordem_fornecimento_id
                   AND abs(COALESCE(i.quantidade_solicitada, 0) - COALESCE(i.quantidade_entregue, 0)) > 0.0005
            ) INTO v_pendente;
            IF v_pendente THEN
                RETURN jsonb_build_object('ok', false, 'code', 'ATENDIMENTO_PENDENTE', 'message', 'A divergência só pode ser resolvida após comprovar todo o atendimento da OF.');
            END IF;
        END IF;
    END IF;
    IF p_novo_status = 'resolvida' AND v_divergencia.tipo = 'voucher_perdido_recusado'
       AND v_divergencia.ordem_transporte_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.ordem_transporte_vouchers
             WHERE ordem_transporte_id = v_divergencia.ordem_transporte_id AND invalidado_em IS NULL
        ) INTO v_ativo;
        IF NOT v_ativo THEN
            RETURN jsonb_build_object('ok', false, 'code', 'VOUCHER_SUBSTITUTO_PENDENTE', 'message', 'Emita um voucher substituto antes de resolver esta divergência.');
        END IF;
    END IF;
    UPDATE public.divergencias_ordens
       SET status = p_novo_status,
           resolucao_comprovacao = CASE WHEN p_novo_status = 'resolvida' THEN trim(p_comprovacao) ELSE resolucao_comprovacao END,
           resolucao_justificativa = CASE WHEN p_novo_status IN ('resolvida', 'encerrada_sem_solucao') THEN trim(p_justificativa) ELSE resolucao_justificativa END,
           updated_at = NOW()
     WHERE id = p_divergencia_id
     RETURNING * INTO v_divergencia;
    PERFORM public.registrar_evento_divergencia(
        p_divergencia_id, 'STATUS_ALTERADO',
        CASE WHEN p_novo_status = 'em_tratamento' THEN 'aberta' ELSE 'em_tratamento' END,
        p_novo_status, trim(p_justificativa),
        jsonb_build_object('comprovacao', NULLIF(trim(p_comprovacao), '')),
        p_usuario_id
    );
    RETURN jsonb_build_object('ok', true, 'divergencia', to_jsonb(v_divergencia));
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_providencia_divergencia(
    p_divergencia_id UUID,
    p_descricao TEXT,
    p_observacoes TEXT,
    p_responsavel_id UUID,
    p_previsao_regularizacao TIMESTAMPTZ,
    p_usuario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_divergencia public.divergencias_ordens%ROWTYPE;
    v_providencia public.divergencia_providencias%ROWTYPE;
BEGIN
    IF COALESCE(trim(p_descricao), '') = '' OR p_usuario_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DADOS_OBRIGATORIOS', 'message', 'Descreva a providência e informe o usuário responsável pelo registro.');
    END IF;
    SELECT * INTO v_divergencia FROM public.divergencias_ordens WHERE id = p_divergencia_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DIVERGENCIA_NAO_ENCONTRADA', 'message', 'Divergência não encontrada.');
    END IF;
    IF v_divergencia.status IN ('resolvida', 'encerrada_sem_solucao') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DIVERGENCIA_ENCERRADA', 'message', 'Não é possível registrar providências em uma divergência encerrada.');
    END IF;
    INSERT INTO public.divergencia_providencias (
        divergencia_id, descricao, observacoes, responsavel_id,
        registrado_por, previsao_regularizacao
    ) VALUES (
        p_divergencia_id, trim(p_descricao), NULLIF(trim(p_observacoes), ''),
        COALESCE(p_responsavel_id, p_usuario_id), p_usuario_id, p_previsao_regularizacao
    ) RETURNING * INTO v_providencia;
    PERFORM public.registrar_evento_divergencia(
        p_divergencia_id, 'PROVIDENCIA_REGISTRADA', v_divergencia.status,
        v_divergencia.status, NULL,
        jsonb_build_object('providencia_id', v_providencia.id, 'descricao', v_providencia.descricao,
            'observacoes', v_providencia.observacoes, 'responsavel_id', v_providencia.responsavel_id,
            'previsao_regularizacao', v_providencia.previsao_regularizacao), p_usuario_id
    );
    RETURN jsonb_build_object('ok', true, 'providencia', to_jsonb(v_providencia));
END;
$function$;

CREATE OR REPLACE FUNCTION public.alterar_impedimento_divergencia(
    p_divergencia_id UUID,
    p_impeditiva BOOLEAN,
    p_justificativa TEXT,
    p_usuario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_divergencia public.divergencias_ordens%ROWTYPE;
    v_impeditiva_anterior BOOLEAN;
BEGIN
    IF p_impeditiva IS NULL OR COALESCE(trim(p_justificativa), '') = '' OR p_usuario_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DADOS_OBRIGATORIOS', 'message', 'Informe o grau impeditivo e a justificativa.');
    END IF;
    SELECT * INTO v_divergencia FROM public.divergencias_ordens WHERE id = p_divergencia_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DIVERGENCIA_NAO_ENCONTRADA', 'message', 'Divergência não encontrada.');
    END IF;
    IF v_divergencia.status IN ('resolvida', 'encerrada_sem_solucao') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DIVERGENCIA_ENCERRADA', 'message', 'O grau impeditivo não pode ser alterado após o encerramento.');
    END IF;
    v_impeditiva_anterior := v_divergencia.impeditiva;
    UPDATE public.divergencias_ordens SET impeditiva = p_impeditiva, updated_at = NOW()
     WHERE id = p_divergencia_id RETURNING * INTO v_divergencia;
    PERFORM public.registrar_evento_divergencia(
        p_divergencia_id, 'GRAU_IMPEDITIVO_ALTERADO', v_divergencia.status, v_divergencia.status,
        trim(p_justificativa), jsonb_build_object('impeditiva_anterior', v_impeditiva_anterior, 'impeditiva_nova', p_impeditiva), p_usuario_id
    );
    RETURN jsonb_build_object('ok', true, 'divergencia', to_jsonb(v_divergencia));
END;
$function$;

CREATE OR REPLACE FUNCTION public.corrigir_ordem_por_divergencia(
    p_divergencia_id UUID,
    p_campos JSONB,
    p_justificativa TEXT,
    p_usuario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_divergencia public.divergencias_ordens%ROWTYPE;
    v_of public.ordens_fornecimento%ROWTYPE;
    v_ot public.ordens_transporte%ROWTYPE;
    v_antes JSONB := '{}'::jsonb;
    v_depois JSONB := '{}'::jsonb;
    v_campo TEXT;
    v_valor TEXT;
    v_validade DATE;
BEGIN
    IF p_campos IS NULL OR jsonb_typeof(p_campos) <> 'object' OR p_campos = '{}'::jsonb
       OR COALESCE(trim(p_justificativa), '') = '' OR p_usuario_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DADOS_OBRIGATORIOS', 'message', 'Informe os campos a corrigir e a justificativa.');
    END IF;
    SELECT * INTO v_divergencia FROM public.divergencias_ordens WHERE id = p_divergencia_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DIVERGENCIA_NAO_ENCONTRADA', 'message', 'Divergência não encontrada.');
    END IF;
    IF v_divergencia.tipo <> 'erro_administrativo' OR v_divergencia.status IN ('resolvida', 'encerrada_sem_solucao') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'CORRECAO_NAO_PERMITIDA', 'message', 'Esta divergência não aceita correção administrativa.');
    END IF;

    IF v_divergencia.ordem_fornecimento_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_campos) AS keys(campo) WHERE campo <> 'observacoes') THEN
            RETURN jsonb_build_object('ok', false, 'code', 'CAMPO_NAO_CORRIGIVEL', 'message', 'Para uma OF, somente as observações podem ser corrigidas por esta funcionalidade.');
        END IF;
        SELECT * INTO v_of FROM public.ordens_fornecimento WHERE id = v_divergencia.ordem_fornecimento_id FOR UPDATE;
        v_antes := jsonb_build_object('observacoes', v_of.observacoes);
        UPDATE public.ordens_fornecimento
           SET observacoes = p_campos->>'observacoes', atualizado_por = p_usuario_id, updated_at = NOW()
         WHERE id = v_of.id;
        v_depois := jsonb_build_object('observacoes', p_campos->>'observacoes');
    ELSE
        IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_campos) AS keys(campo) WHERE campo NOT IN (
            'veiculo_placa', 'tipo_combustivel', 'posto_abastecimento',
            'validade_ate', 'observacoes'
        )) THEN
            RETURN jsonb_build_object('ok', false, 'code', 'CAMPO_NAO_CORRIGIVEL', 'message', 'A OT contém um campo não permitido para correção administrativa.');
        END IF;
        SELECT * INTO v_ot FROM public.ordens_transporte WHERE id = v_divergencia.ordem_transporte_id FOR UPDATE;
        IF v_ot.status <> 'emitida' THEN
            RETURN jsonb_build_object('ok', false, 'code', 'OT_NAO_PENDENTE', 'message', 'Somente campos de uma OT emitida, ainda não entregue, podem ser corrigidos.');
        END IF;
        FOR v_campo, v_valor IN SELECT key, value #>> '{}' FROM jsonb_each(p_campos)
        LOOP
            v_antes := v_antes || jsonb_build_object(v_campo, to_jsonb(v_ot)->v_campo);
            IF v_campo IN ('tipo_combustivel', 'posto_abastecimento', 'validade_ate')
               AND COALESCE(trim(v_valor), '') = '' THEN
                RETURN jsonb_build_object('ok', false, 'code', 'CAMPO_INVALIDO', 'message', 'O valor informado não pode ficar vazio.');
            END IF;
            IF v_campo = 'veiculo_placa' AND length(v_valor) > 10 THEN
                RETURN jsonb_build_object('ok', false, 'code', 'CAMPO_INVALIDO', 'message', 'A placa deve ter no máximo 10 caracteres.');
            ELSIF v_campo = 'tipo_combustivel' AND length(v_valor) > 40 THEN
                RETURN jsonb_build_object('ok', false, 'code', 'CAMPO_INVALIDO', 'message', 'O tipo de combustível deve ter no máximo 40 caracteres.');
            ELSIF v_campo = 'posto_abastecimento' AND length(v_valor) > 200 THEN
                RETURN jsonb_build_object('ok', false, 'code', 'CAMPO_INVALIDO', 'message', 'O posto deve ter no máximo 200 caracteres.');
            END IF;
            CASE v_campo
                WHEN 'veiculo_placa' THEN UPDATE public.ordens_transporte SET veiculo_placa = NULLIF(trim(v_valor), '') WHERE id = v_ot.id;
                WHEN 'tipo_combustivel' THEN UPDATE public.ordens_transporte SET tipo_combustivel = NULLIF(trim(v_valor), '') WHERE id = v_ot.id;
                WHEN 'posto_abastecimento' THEN UPDATE public.ordens_transporte SET posto_abastecimento = NULLIF(trim(v_valor), '') WHERE id = v_ot.id;
                WHEN 'validade_ate' THEN
                    IF v_valor !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
                        RETURN jsonb_build_object('ok', false, 'code', 'CAMPO_INVALIDO', 'message', 'Informe uma data de validade válida.');
                    END IF;
                    BEGIN
                        v_validade := v_valor::DATE;
                    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
                        RETURN jsonb_build_object('ok', false, 'code', 'CAMPO_INVALIDO', 'message', 'Informe uma data de validade válida.');
                    END;
                    IF v_validade < v_ot.data_emissao::DATE THEN
                        RETURN jsonb_build_object('ok', false, 'code', 'CAMPO_INVALIDO', 'message', 'A validade não pode ser anterior à emissão da OT.');
                    END IF;
                    UPDATE public.ordens_transporte SET validade_ate = v_validade WHERE id = v_ot.id;
                WHEN 'observacoes' THEN UPDATE public.ordens_transporte SET observacoes = NULLIF(trim(v_valor), '') WHERE id = v_ot.id;
            END CASE;
        END LOOP;
        UPDATE public.ordens_transporte SET updated_at = NOW() WHERE id = v_ot.id;
        SELECT jsonb_object_agg(key, value) INTO v_depois
          FROM jsonb_each(to_jsonb((SELECT t FROM public.ordens_transporte t WHERE t.id = v_ot.id)))
         WHERE key IN (SELECT jsonb_object_keys(p_campos));
    END IF;
    PERFORM public.registrar_evento_divergencia(
        p_divergencia_id, 'CORRECAO_ADMINISTRATIVA', v_divergencia.status, v_divergencia.status,
        trim(p_justificativa), jsonb_build_object('valores_anteriores', v_antes, 'valores_novos', v_depois), p_usuario_id
    );
    RETURN jsonb_build_object('ok', true, 'valores_anteriores', v_antes, 'valores_novos', v_depois);
END;
$function$;

CREATE OR REPLACE FUNCTION public.substituir_voucher_por_divergencia(
    p_divergencia_id UUID,
    p_voucher_id UUID,
    p_justificativa TEXT,
    p_usuario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_divergencia public.divergencias_ordens%ROWTYPE;
    v_ordem public.ordens_transporte%ROWTYPE;
    v_anterior public.ordem_transporte_vouchers%ROWTYPE;
    v_novo public.ordem_transporte_vouchers%ROWTYPE;
    v_via INTEGER;
BEGIN
    IF p_usuario_id IS NULL OR COALESCE(trim(p_justificativa), '') = '' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DADOS_OBRIGATORIOS', 'message', 'Informe a justificativa e o usuário.');
    END IF;
    SELECT * INTO v_divergencia FROM public.divergencias_ordens WHERE id = p_divergencia_id FOR UPDATE;
    IF NOT FOUND OR v_divergencia.ordem_transporte_id IS NULL OR v_divergencia.tipo <> 'voucher_perdido_recusado' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DIVERGENCIA_NAO_COMPATIVEL', 'message', 'A divergência não está vinculada a uma OT com voucher perdido ou recusado.');
    END IF;
    IF v_divergencia.status IN ('resolvida', 'encerrada_sem_solucao') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DIVERGENCIA_ENCERRADA', 'message', 'Não é possível substituir voucher após o encerramento da divergência.');
    END IF;
    SELECT * INTO v_ordem FROM public.ordens_transporte WHERE id = v_divergencia.ordem_transporte_id FOR UPDATE;
    IF v_ordem.status NOT IN ('emitida', 'entregue', 'utilizacao_comprovada') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OT_NAO_PERMITE_SUBSTITUICAO', 'message', 'A situação da OT não permite substituir este voucher.');
    END IF;
    SELECT * INTO v_anterior FROM public.ordem_transporte_vouchers
     WHERE id = p_voucher_id AND ordem_transporte_id = v_ordem.id FOR UPDATE;
    IF NOT FOUND OR v_anterior.invalidado_em IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'VOUCHER_NAO_ATIVO', 'message', 'O voucher não existe nesta OT ou já está invalidado.');
    END IF;
    UPDATE public.ordem_transporte_vouchers
       SET invalidado_em = NOW(), invalidado_por = p_usuario_id, motivo_invalidacao = trim(p_justificativa)
     WHERE id = v_anterior.id;
    SELECT COALESCE(max(numero_via), 0) + 1 INTO v_via
      FROM public.ordem_transporte_vouchers WHERE ordem_transporte_id = v_ordem.id;
    INSERT INTO public.ordem_transporte_vouchers (
        ordem_transporte_id, numero_via, tipo_via, codigo, emitido_por, substitui_voucher_id
    ) VALUES (
        v_ordem.id, v_via, 'segunda_via', 'VT-' || upper(encode(gen_random_bytes(16), 'hex')),
        p_usuario_id, v_anterior.id
    ) RETURNING * INTO v_novo;
    PERFORM public.registrar_evento_divergencia(
        p_divergencia_id, 'VOUCHER_SUBSTITUIDO', v_divergencia.status, v_divergencia.status,
        trim(p_justificativa), jsonb_build_object('voucher_anterior_id', v_anterior.id, 'voucher_novo_id', v_novo.id), p_usuario_id
    );
    RETURN jsonb_build_object('ok', true, 'voucher_anterior', to_jsonb(v_anterior), 'voucher', to_jsonb(v_novo));
END;
$function$;

CREATE OR REPLACE FUNCTION public.solicitar_cancelamento_por_divergencia(
    p_divergencia_id UUID,
    p_motivo TEXT,
    p_usuario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_divergencia public.divergencias_ordens%ROWTYPE;
    v_ordem_of public.ordens_fornecimento%ROWTYPE;
    v_ordem_ot public.ordens_transporte%ROWTYPE;
    v_solicitacao public.solicitacoes_cancelamento_ordem%ROWTYPE;
BEGIN
    IF COALESCE(trim(p_motivo), '') = '' OR p_usuario_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DADOS_OBRIGATORIOS', 'message', 'Informe o motivo do encaminhamento.');
    END IF;
    SELECT * INTO v_divergencia FROM public.divergencias_ordens WHERE id = p_divergencia_id FOR UPDATE;
    IF NOT FOUND OR v_divergencia.tipo <> 'execucao_inviavel' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DIVERGENCIA_NAO_COMPATIVEL', 'message', 'Somente divergência de execução inviável pode ser encaminhada para cancelamento.');
    END IF;
    IF v_divergencia.status IN ('resolvida', 'encerrada_sem_solucao') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DIVERGENCIA_ENCERRADA', 'message', 'A divergência já foi encerrada.');
    END IF;
    IF v_divergencia.ordem_fornecimento_id IS NOT NULL THEN
        SELECT * INTO v_ordem_of FROM public.ordens_fornecimento WHERE id = v_divergencia.ordem_fornecimento_id FOR UPDATE;
        IF v_ordem_of.status IN ('cancelada', 'finalizada') THEN
            RETURN jsonb_build_object('ok', false, 'code', 'ORDEM_NAO_CANCELAVEL', 'message', 'A ordem já foi finalizada ou cancelada.');
        END IF;
        INSERT INTO public.solicitacoes_cancelamento_ordem (
            divergencia_id, ordem_fornecimento_id, motivo, solicitado_por
        ) VALUES (p_divergencia_id, v_ordem_of.id, trim(p_motivo), p_usuario_id)
        RETURNING * INTO v_solicitacao;
    ELSE
        SELECT * INTO v_ordem_ot FROM public.ordens_transporte WHERE id = v_divergencia.ordem_transporte_id FOR UPDATE;
        IF v_ordem_ot.status IN ('cancelada', 'finalizada') THEN
            RETURN jsonb_build_object('ok', false, 'code', 'ORDEM_NAO_CANCELAVEL', 'message', 'A ordem já foi finalizada ou cancelada.');
        END IF;
        INSERT INTO public.solicitacoes_cancelamento_ordem (
            divergencia_id, ordem_transporte_id, motivo, solicitado_por
        ) VALUES (p_divergencia_id, v_ordem_ot.id, trim(p_motivo), p_usuario_id)
        RETURNING * INTO v_solicitacao;
    END IF;
    PERFORM public.registrar_evento_divergencia(
        p_divergencia_id, 'ENCAMINHADA_RF_F14', v_divergencia.status, v_divergencia.status,
        trim(p_motivo), jsonb_build_object('solicitacao_cancelamento_id', v_solicitacao.id), p_usuario_id
    );
    RETURN jsonb_build_object('ok', true, 'solicitacao', to_jsonb(v_solicitacao));
EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CANCELAMENTO_PENDENTE', 'message', 'Já existe uma solicitação de cancelamento aguardando decisão para esta ordem.');
END;
$function$;

CREATE OR REPLACE FUNCTION public.decidir_cancelamento_ordem(
    p_solicitacao_id UUID,
    p_aprovado BOOLEAN,
    p_justificativa TEXT,
    p_usuario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_solicitacao public.solicitacoes_cancelamento_ordem%ROWTYPE;
    v_divergencia public.divergencias_ordens%ROWTYPE;
    v_status_ordem TEXT;
BEGIN
    IF p_aprovado IS NULL OR COALESCE(trim(p_justificativa), '') = '' OR p_usuario_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DADOS_OBRIGATORIOS', 'message', 'Informe a decisão e sua justificativa.');
    END IF;
    SELECT * INTO v_solicitacao FROM public.solicitacoes_cancelamento_ordem WHERE id = p_solicitacao_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'CANCELAMENTO_NAO_ENCONTRADO', 'message', 'Solicitação de cancelamento não encontrada.');
    END IF;
    IF v_solicitacao.status <> 'solicitada' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'CANCELAMENTO_JA_DECIDIDO', 'message', 'Esta solicitação já foi decidida.');
    END IF;
    IF v_solicitacao.ordem_fornecimento_id IS NOT NULL THEN
        SELECT status INTO v_status_ordem FROM public.ordens_fornecimento WHERE id = v_solicitacao.ordem_fornecimento_id FOR UPDATE;
    ELSE
        SELECT status INTO v_status_ordem FROM public.ordens_transporte WHERE id = v_solicitacao.ordem_transporte_id FOR UPDATE;
    END IF;
    IF p_aprovado AND v_status_ordem IN ('finalizada', 'cancelada') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ORDEM_NAO_CANCELAVEL', 'message', 'A ordem foi finalizada ou cancelada antes da decisão.');
    END IF;
    UPDATE public.solicitacoes_cancelamento_ordem
       SET status = CASE WHEN p_aprovado THEN 'aprovada' ELSE 'recusada' END,
           justificativa_decisao = trim(p_justificativa),
           decidido_por = p_usuario_id,
           decidido_em = NOW()
     WHERE id = p_solicitacao_id RETURNING * INTO v_solicitacao;
    IF p_aprovado THEN
        IF v_solicitacao.ordem_fornecimento_id IS NOT NULL THEN
            UPDATE public.ordens_fornecimento SET status = 'cancelada', atualizado_por = p_usuario_id, updated_at = NOW()
             WHERE id = v_solicitacao.ordem_fornecimento_id;
            INSERT INTO public.auditoria_eventos (entidade_tipo, entidade_id, acao, usuario_id, dados, idempotency_key)
            VALUES ('ordem_fornecimento', v_solicitacao.ordem_fornecimento_id, 'OF_CANCELADA_RF_F14', p_usuario_id,
                    jsonb_build_object('solicitacao_id', v_solicitacao.id, 'divergencia_id', v_solicitacao.divergencia_id, 'justificativa', trim(p_justificativa)),
                    'cancelamento:' || v_solicitacao.id::TEXT || ':decisao');
        ELSE
            UPDATE public.ordens_transporte SET status = 'cancelada', updated_at = NOW()
             WHERE id = v_solicitacao.ordem_transporte_id;
            INSERT INTO public.auditoria_eventos (entidade_tipo, entidade_id, acao, usuario_id, dados, idempotency_key)
            VALUES ('ordem_transporte', v_solicitacao.ordem_transporte_id, 'OT_CANCELADA_RF_F14', p_usuario_id,
                    jsonb_build_object('solicitacao_id', v_solicitacao.id, 'divergencia_id', v_solicitacao.divergencia_id, 'justificativa', trim(p_justificativa)),
                    'cancelamento:' || v_solicitacao.id::TEXT || ':decisao');
        END IF;
    END IF;
    SELECT * INTO v_divergencia FROM public.divergencias_ordens WHERE id = v_solicitacao.divergencia_id;
    PERFORM public.registrar_evento_divergencia(
        v_divergencia.id,
        CASE WHEN p_aprovado THEN 'CANCELAMENTO_APROVADO_RF_F14' ELSE 'CANCELAMENTO_RECUSADO_RF_F14' END,
        v_divergencia.status, v_divergencia.status, trim(p_justificativa),
        jsonb_build_object('solicitacao_id', v_solicitacao.id, 'status_cancelamento', v_solicitacao.status), p_usuario_id
    );
    RETURN jsonb_build_object('ok', true, 'solicitacao', to_jsonb(v_solicitacao), 'ordem_cancelada', p_aprovado);
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_comprovacao_of(UUID, DATE, TEXT, TEXT, JSONB, JSONB, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_comprovacao_of(UUID, DATE, TEXT, TEXT, JSONB, JSONB, UUID, TEXT)
    TO service_role;
REVOKE ALL ON FUNCTION public.registrar_utilizacao_voucher_ot(UUID, UUID, TIMESTAMPTZ, TEXT, NUMERIC, JSONB, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_utilizacao_voucher_ot(UUID, UUID, TIMESTAMPTZ, TEXT, NUMERIC, JSONB, UUID, TEXT)
    TO service_role;
REVOKE ALL ON FUNCTION public.finalizar_ordem_fornecimento_com_divergencias(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_ordem_fornecimento_com_divergencias(UUID, UUID)
    TO service_role;
REVOKE ALL ON FUNCTION public.finalizar_ordem_transporte_com_divergencias(UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_ordem_transporte_com_divergencias(UUID, UUID)
    TO service_role;
REVOKE ALL ON FUNCTION public.registrar_evento_divergencia(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_evento_divergencia(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID)
    TO service_role;
REVOKE ALL ON FUNCTION public.criar_divergencia_ordem(TEXT, UUID, TEXT, TEXT, BOOLEAN, JSONB, UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_divergencia_ordem(TEXT, UUID, TEXT, TEXT, BOOLEAN, JSONB, UUID, TEXT)
    TO service_role;
REVOKE ALL ON FUNCTION public.transicionar_divergencia_ordem(UUID, TEXT, TEXT, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transicionar_divergencia_ordem(UUID, TEXT, TEXT, TEXT, UUID)
    TO service_role;
REVOKE ALL ON FUNCTION public.registrar_providencia_divergencia(UUID, TEXT, TEXT, UUID, TIMESTAMPTZ, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_providencia_divergencia(UUID, TEXT, TEXT, UUID, TIMESTAMPTZ, UUID)
    TO service_role;
REVOKE ALL ON FUNCTION public.alterar_impedimento_divergencia(UUID, BOOLEAN, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alterar_impedimento_divergencia(UUID, BOOLEAN, TEXT, UUID)
    TO service_role;
REVOKE ALL ON FUNCTION public.corrigir_ordem_por_divergencia(UUID, JSONB, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corrigir_ordem_por_divergencia(UUID, JSONB, TEXT, UUID)
    TO service_role;
REVOKE ALL ON FUNCTION public.substituir_voucher_por_divergencia(UUID, UUID, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.substituir_voucher_por_divergencia(UUID, UUID, TEXT, UUID)
    TO service_role;
REVOKE ALL ON FUNCTION public.solicitar_cancelamento_por_divergencia(UUID, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_cancelamento_por_divergencia(UUID, TEXT, UUID)
    TO service_role;
REVOKE ALL ON FUNCTION public.decidir_cancelamento_ordem(UUID, BOOLEAN, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decidir_cancelamento_ordem(UUID, BOOLEAN, TEXT, UUID)
    TO service_role;
