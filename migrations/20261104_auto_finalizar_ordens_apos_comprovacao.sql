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
        RETURN jsonb_build_object('ok', false, 'code', 'DADOS_OBRIGATORIOS', 'message', 'O usuario responsavel pela finalizacao e obrigatorio.');
    END IF;
    SELECT * INTO v_ordem FROM public.ordens_transporte WHERE id = p_ordem_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OT_NAO_ENCONTRADA', 'message', 'Ordem de Transporte nao encontrada.');
    END IF;
    IF v_ordem.status = 'finalizada' THEN
        RETURN jsonb_build_object('ok', true, 'ja_finalizada', true);
    END IF;
    IF v_ordem.status NOT IN ('utilizacao_comprovada') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OT_UTILIZACAO_PENDENTE', 'message', 'A OT precisa ter utilizacao comprovada antes da finalizacao.');
    END IF;
    SELECT COALESCE(sum(quantidade), 0) INTO v_total
      FROM public.utilizacoes_voucher_ot WHERE ordem_transporte_id = p_ordem_id;
    IF v_total <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OT_UTILIZACAO_PENDENTE', 'message', 'A OT precisa ter utilizacao comprovada antes da finalizacao.');
    END IF;
    IF abs(COALESCE(v_ordem.quantidade_autorizada, 0) - v_total) > 0.0005 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'OT_UTILIZACAO_PENDENTE', 'message', 'A OT so pode ser finalizada depois que todo o saldo autorizado for comprovado.');
    END IF;
    SELECT jsonb_agg(jsonb_build_object('id', d.id, 'tipo', d.tipo, 'descricao', d.descricao, 'status', d.status))
      INTO v_bloqueios
      FROM public.divergencias_ordens d
     WHERE d.ordem_transporte_id = p_ordem_id
       AND d.impeditiva = true
       AND d.status <> 'resolvida';
    IF v_bloqueios IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DIVERGENCIA_IMPEDITIVA', 'message', 'A finalizacao esta bloqueada por divergencia impeditiva nao resolvida.', 'divergencias', v_bloqueios);
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

CREATE OR REPLACE FUNCTION public.tentar_finalizar_ordem_automaticamente(
    p_tipo_ordem TEXT,
    p_ordem_id UUID,
    p_usuario_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_of public.ordens_fornecimento%ROWTYPE;
    v_ot public.ordens_transporte%ROWTYPE;
    v_resultado JSONB;
    v_total NUMERIC(12, 3);
    v_responsaveis JSONB;
    v_idempotency_key TEXT;
BEGIN
    IF p_tipo_ordem = 'OF' THEN
        SELECT * INTO v_of
          FROM public.ordens_fornecimento
         WHERE id = p_ordem_id
         FOR UPDATE;
        IF NOT FOUND OR v_of.status NOT IN ('enviada', 'em_entrega', 'entregue') THEN
            RETURN false;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM public.ordem_fornecimento_itens
             WHERE ordem_fornecimento_id = p_ordem_id
        ) OR EXISTS (
            SELECT 1 FROM public.ordem_fornecimento_itens
             WHERE ordem_fornecimento_id = p_ordem_id
               AND abs(COALESCE(quantidade_solicitada, 0) - COALESCE(quantidade_entregue, 0)) > 0.0005
        ) THEN
            RETURN false;
        END IF;

        v_resultado := public.finalizar_ordem_fornecimento_com_divergencias(p_ordem_id, p_usuario_id);
        IF NOT COALESCE((v_resultado->>'ok')::BOOLEAN, false)
           OR COALESCE((v_resultado->>'ja_finalizada')::BOOLEAN, false) THEN
            RETURN false;
        END IF;

        SELECT COALESCE(jsonb_agg(usuario_id ORDER BY usuario_id), '[]'::jsonb)
          INTO v_responsaveis
          FROM public.ordem_fornecimento_responsaveis
         WHERE ordem_fornecimento_id = p_ordem_id;
        v_idempotency_key := 'of:' || p_ordem_id::TEXT || ':finalizacao';

        INSERT INTO public.ordem_fornecimento_prazo_historico (
            ordem_fornecimento_id, ciclo, data_limite, status_prazo,
            tipo_evento, responsavel_ids, usuario_id, idempotency_key
        ) VALUES (
            p_ordem_id, COALESCE(v_of.prazo_ciclo, 1),
            v_of.data_previsao_entrega::DATE, COALESCE(v_of.status_prazo, 'normal'),
            'ORDEM_FINALIZADA', v_responsaveis, p_usuario_id, v_idempotency_key
        ) ON CONFLICT (idempotency_key) DO NOTHING;

        INSERT INTO public.auditoria_eventos (
            entidade_tipo, entidade_id, acao, usuario_id, dados, idempotency_key
        ) VALUES (
            'ordem_fornecimento_prazo', p_ordem_id, 'ORDEM_FINALIZADA', p_usuario_id,
            jsonb_build_object(
                'ciclo', COALESCE(v_of.prazo_ciclo, 1),
                'data_limite', v_of.data_previsao_entrega::DATE,
                'status_prazo', COALESCE(v_of.status_prazo, 'normal'),
                'responsavel_ids', v_responsaveis
            ), v_idempotency_key
        ) ON CONFLICT (idempotency_key) DO NOTHING;

        IF v_of.paciente_id IS NOT NULL THEN
            INSERT INTO public.historico_pacientes (
                paciente_id, usuario_id, tipo_evento, descricao,
                referencia_id, idempotency_key
            ) VALUES (
                v_of.paciente_id, p_usuario_id, 'OF_FINALIZADA',
                'A Ordem de Fornecimento ' || v_of.numero || ' foi finalizada.',
                p_ordem_id, v_idempotency_key
            ) ON CONFLICT (idempotency_key) DO NOTHING;
        END IF;
        RETURN true;
    END IF;

    IF p_tipo_ordem = 'OT' THEN
        SELECT * INTO v_ot
          FROM public.ordens_transporte
         WHERE id = p_ordem_id
         FOR UPDATE;
        IF NOT FOUND OR v_ot.status <> 'utilizacao_comprovada' THEN
            RETURN false;
        END IF;
        SELECT COALESCE(sum(quantidade), 0) INTO v_total
          FROM public.utilizacoes_voucher_ot
         WHERE ordem_transporte_id = p_ordem_id;
        IF v_total <= 0 OR abs(COALESCE(v_ot.quantidade_autorizada, 0) - v_total) > 0.0005 THEN
            RETURN false;
        END IF;

        v_resultado := public.finalizar_ordem_transporte_com_divergencias(p_ordem_id, p_usuario_id);
        RETURN COALESCE((v_resultado->>'ok')::BOOLEAN, false)
           AND NOT COALESCE((v_resultado->>'ja_finalizada')::BOOLEAN, false);
    END IF;

    RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.tentar_finalizar_ordem_automaticamente(TEXT, UUID, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.auto_finalizar_of_apos_comprovacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_ordem_id UUID;
    v_usuario_id UUID;
BEGIN
    SELECT ordem_fornecimento_id, registrado_por
      INTO v_ordem_id, v_usuario_id
      FROM public.comprovacoes_of
     WHERE id = NEW.comprovacao_id;
    IF FOUND THEN
        PERFORM public.tentar_finalizar_ordem_automaticamente('OF', v_ordem_id, v_usuario_id);
    END IF;
    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_finalizar_of_apos_comprovacao ON public.comprovacoes_of_itens;
-- Deferred execution sees all item lines and delivered totals from the proof RPC.
CREATE CONSTRAINT TRIGGER trg_auto_finalizar_of_apos_comprovacao
AFTER INSERT ON public.comprovacoes_of_itens
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.auto_finalizar_of_apos_comprovacao();

CREATE OR REPLACE FUNCTION public.auto_finalizar_ot_apos_utilizacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    PERFORM public.tentar_finalizar_ordem_automaticamente('OT', NEW.ordem_transporte_id, NEW.registrado_por);
    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_finalizar_ot_apos_utilizacao ON public.utilizacoes_voucher_ot;
CREATE CONSTRAINT TRIGGER trg_auto_finalizar_ot_apos_utilizacao
AFTER INSERT ON public.utilizacoes_voucher_ot
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.auto_finalizar_ot_apos_utilizacao();

CREATE OR REPLACE FUNCTION public.auto_finalizar_ordem_apos_divergencia_resolvida()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_tipo_ordem TEXT;
    v_ordem_id UUID;
BEGIN
    IF NEW.acao <> 'STATUS_ALTERADO' OR NEW.status_novo <> 'resolvida' THEN
        RETURN NULL;
    END IF;

    SELECT CASE WHEN ordem_fornecimento_id IS NOT NULL THEN 'OF' ELSE 'OT' END,
           COALESCE(ordem_fornecimento_id, ordem_transporte_id)
      INTO v_tipo_ordem, v_ordem_id
      FROM public.divergencias_ordens
     WHERE id = NEW.divergencia_id;
    IF FOUND THEN
        PERFORM public.tentar_finalizar_ordem_automaticamente(v_tipo_ordem, v_ordem_id, NEW.usuario_id);
    END IF;
    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_finalizar_apos_divergencia_resolvida ON public.divergencia_eventos;
CREATE CONSTRAINT TRIGGER trg_auto_finalizar_apos_divergencia_resolvida
AFTER INSERT ON public.divergencia_eventos
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.auto_finalizar_ordem_apos_divergencia_resolvida();
