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
    v_status_anterior TEXT := p_status_anterior;
    v_status_novo TEXT := p_status_novo;
BEGIN
    IF p_acao IN ('PROVIDENCIA_REGISTRADA', 'CORRECAO_ADMINISTRATIVA')
       AND p_status_anterior = 'aberta' THEN
        UPDATE public.divergencias_ordens
           SET status = 'em_tratamento', updated_at = NOW()
         WHERE id = p_divergencia_id AND status = 'aberta';

        IF FOUND THEN
            v_status_novo := 'em_tratamento';
        END IF;
    END IF;

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
        p_divergencia_id, p_acao, v_status_anterior, v_status_novo,
        p_justificativa, COALESCE(p_dados, '{}'::jsonb), p_usuario_id
    );

    INSERT INTO public.auditoria_eventos (
        entidade_tipo, entidade_id, acao, usuario_id, dados
    ) VALUES (
        'divergencia_ordem', p_divergencia_id, p_acao, p_usuario_id,
        jsonb_build_object(
            'status_anterior', v_status_anterior,
            'status_novo', v_status_novo,
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
