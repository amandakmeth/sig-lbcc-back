CREATE TABLE IF NOT EXISTS public.ordens_transporte (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero VARCHAR(40) NOT NULL UNIQUE,
    cotacao_id UUID NOT NULL UNIQUE
        REFERENCES public.cotacoes(id) ON DELETE RESTRICT,
    paciente_id UUID NOT NULL
        REFERENCES public.pacientes(id) ON DELETE RESTRICT,
    fornecedor_id UUID NOT NULL
        REFERENCES public.fornecedores(id) ON DELETE RESTRICT,
    veiculo_placa VARCHAR(10),
    tipo_combustivel VARCHAR(40) NOT NULL,
    quantidade_autorizada NUMERIC(12, 3) NOT NULL
        CHECK (quantidade_autorizada > 0),
    posto_abastecimento VARCHAR(200) NOT NULL,
    data_emissao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    validade_ate DATE NOT NULL,
    observacoes TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'emitida'
        CHECK (
            status IN (
                'emitida',
                'entregue',
                'utilizacao_comprovada',
                'finalizada',
                'vencida',
                'cancelada'
            )
        ),
    created_by UUID REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ordem_transporte_validade_check
        CHECK (validade_ate >= data_emissao::DATE)
);

CREATE TABLE IF NOT EXISTS public.ordem_transporte_vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ordem_transporte_id UUID NOT NULL
        REFERENCES public.ordens_transporte(id) ON DELETE RESTRICT,
    numero_via INTEGER NOT NULL CHECK (numero_via >= 1),
    tipo_via VARCHAR(20) NOT NULL
        CHECK (tipo_via IN ('original', 'segunda_via')),
    codigo VARCHAR(80) NOT NULL UNIQUE,
    emitido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    emitido_por UUID REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    entregue_em TIMESTAMPTZ,
    entregue_por UUID REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    destinatario VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ordem_transporte_voucher_via_unique
        UNIQUE (ordem_transporte_id, numero_via),

    CONSTRAINT ordem_transporte_voucher_entrega_check
        CHECK (
            (entregue_em IS NULL AND entregue_por IS NULL AND destinatario IS NULL)
            OR
            (entregue_em IS NOT NULL AND entregue_por IS NOT NULL AND destinatario IS NOT NULL)
        ),

    CONSTRAINT ordem_transporte_voucher_tipo_via_check
        CHECK (
            (numero_via = 1 AND tipo_via = 'original')
            OR
            (numero_via > 1 AND tipo_via = 'segunda_via')
        )
);

CREATE INDEX IF NOT EXISTS idx_ordens_transporte_paciente
    ON public.ordens_transporte(paciente_id);

CREATE INDEX IF NOT EXISTS idx_ordens_transporte_status_validade
    ON public.ordens_transporte(status, validade_ate);

CREATE INDEX IF NOT EXISTS idx_ordem_transporte_vouchers_ordem
    ON public.ordem_transporte_vouchers(ordem_transporte_id);

ALTER TABLE public.ordens_transporte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordem_transporte_vouchers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ordens_transporte
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.ordem_transporte_vouchers
    FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.ordens_transporte
    TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.ordem_transporte_vouchers
    TO service_role;


-- Registrar a entrega do voucher e atualizar o estado da OT
-- na mesma transação.


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
    IF p_ordem_id IS NULL OR p_voucher_id IS NULL
       OR p_entregue_por IS NULL THEN
        RAISE EXCEPTION 'DADOS_OBRIGATORIOS';
    END IF;

    IF p_destinatario IS NULL OR LENGTH(TRIM(p_destinatario)) = 0 THEN
        RAISE EXCEPTION 'DESTINATARIO_OBRIGATORIO';
    END IF;

    SELECT *
      INTO v_ordem
      FROM public.ordens_transporte
     WHERE id = p_ordem_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'OT_NAO_ENCONTRADA';
    END IF;

    SELECT *
      INTO v_voucher
      FROM public.ordem_transporte_vouchers
     WHERE id = p_voucher_id
       AND ordem_transporte_id = p_ordem_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'VOUCHER_NAO_ENCONTRADO';
    END IF;

    IF v_ordem.status NOT IN ('emitida', 'entregue') THEN
        RAISE EXCEPTION 'OT_NAO_PODE_SER_ENTREGUE';
    END IF;

    IF v_ordem.status = 'entregue'
       AND v_voucher.tipo_via <> 'segunda_via' THEN
        RAISE EXCEPTION 'OT_NAO_PODE_SER_ENTREGUE';
    END IF;

    IF v_ordem.validade_ate <
       (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
        RAISE EXCEPTION 'OT_VENCIDA';
    END IF;

    IF v_voucher.entregue_em IS NOT NULL THEN
        RAISE EXCEPTION 'VOUCHER_JA_ENTREGUE';
    END IF;

    UPDATE public.ordem_transporte_vouchers
       SET entregue_em = NOW(),
           entregue_por = p_entregue_por,
           destinatario = TRIM(p_destinatario)
     WHERE id = p_voucher_id
     RETURNING * INTO v_voucher;

    IF v_ordem.status = 'emitida' THEN
        UPDATE public.ordens_transporte
           SET status = 'entregue',
               updated_at = NOW()
         WHERE id = p_ordem_id
         RETURNING * INTO v_ordem;
    END IF;

    RETURN jsonb_build_object(
        'ordem', to_jsonb(v_ordem),
        'voucher', to_jsonb(v_voucher)
    );
END;
$function$;


-- Gerar segunda via do voucher sem criar outra OT.

CREATE OR REPLACE FUNCTION public.gerar_segunda_via_voucher_transporte(
    p_ordem_id UUID,
    p_emitido_por UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_ordem public.ordens_transporte%ROWTYPE;
    v_voucher public.ordem_transporte_vouchers%ROWTYPE;
    v_proxima_via INTEGER;
BEGIN
    IF p_ordem_id IS NULL OR p_emitido_por IS NULL THEN
        RAISE EXCEPTION 'DADOS_OBRIGATORIOS';
    END IF;

    SELECT *
      INTO v_ordem
      FROM public.ordens_transporte
     WHERE id = p_ordem_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'OT_NAO_ENCONTRADA';
    END IF;

    IF v_ordem.status NOT IN ('emitida', 'entregue') THEN
        RAISE EXCEPTION 'OT_NAO_PERMITE_SEGUNDA_VIA';
    END IF;

    IF v_ordem.validade_ate <
       (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
        RAISE EXCEPTION 'OT_VENCIDA';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.usuarios
         WHERE id = p_emitido_por
    ) THEN
        RAISE EXCEPTION 'USUARIO_NAO_ENCONTRADO';
    END IF;

    SELECT COALESCE(MAX(numero_via), 0) + 1
      INTO v_proxima_via
      FROM public.ordem_transporte_vouchers
     WHERE ordem_transporte_id = p_ordem_id;

    INSERT INTO public.ordem_transporte_vouchers (
        ordem_transporte_id,
        numero_via,
        tipo_via,
        codigo,
        emitido_por
    )
    VALUES (
        p_ordem_id,
        v_proxima_via,
        'segunda_via',
        'VT-' || UPPER(encode(gen_random_bytes(16), 'hex')),
        p_emitido_por
    )
    RETURNING * INTO v_voucher;

    RETURN jsonb_build_object(
        'ordem', to_jsonb(v_ordem),
        'voucher', to_jsonb(v_voucher)
    );
END;
$function$;


-- Apenas o backend, usando service_role, pode executar as RPCs.

REVOKE ALL ON FUNCTION public.registrar_entrega_voucher_transporte(
    UUID, UUID, UUID, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_entrega_voucher_transporte(
    UUID, UUID, UUID, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.gerar_segunda_via_voucher_transporte(
    UUID, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.gerar_segunda_via_voucher_transporte(
    UUID, UUID
) TO service_role;
