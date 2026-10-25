
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
    IF p_ordem_id IS NULL
       OR p_voucher_id IS NULL
       OR p_entregue_por IS NULL THEN
        RAISE EXCEPTION 'DADOS_OBRIGATORIOS';
    END IF;

    IF p_destinatario IS NULL
       OR LENGTH(TRIM(p_destinatario)) = 0 THEN
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
