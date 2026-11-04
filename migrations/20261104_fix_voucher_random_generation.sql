-- Corrige a geração do código das segundas vias. As RPCs usam
-- search_path = public; pg_catalog.gen_random_uuid é nativo e qualificado,
-- portanto não depende de pgcrypto estar visível no search_path.

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
        'VT-' || UPPER(REPLACE(pg_catalog.gen_random_uuid()::TEXT, '-', '')),
        p_emitido_por
    )
    RETURNING * INTO v_voucher;

    RETURN jsonb_build_object(
        'ordem', to_jsonb(v_ordem),
        'voucher', to_jsonb(v_voucher)
    );
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
        v_ordem.id, v_via, 'segunda_via',
        'VT-' || upper(replace(pg_catalog.gen_random_uuid()::TEXT, '-', '')),
        p_usuario_id, v_anterior.id
    ) RETURNING * INTO v_novo;
    PERFORM public.registrar_evento_divergencia(
        p_divergencia_id, 'VOUCHER_SUBSTITUIDO', v_divergencia.status, v_divergencia.status,
        trim(p_justificativa), jsonb_build_object('voucher_anterior_id', v_anterior.id, 'voucher_novo_id', v_novo.id), p_usuario_id
    );
    RETURN jsonb_build_object('ok', true, 'voucher_anterior', to_jsonb(v_anterior), 'voucher', to_jsonb(v_novo));
END;
$function$;
