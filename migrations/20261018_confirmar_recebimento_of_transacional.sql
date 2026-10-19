CREATE OR REPLACE FUNCTION public.confirmar_recebimento_ordem(
    p_id uuid,
    p_atualizado_por uuid,
    p_canal_confirmacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_ordem public.ordens_fornecimento%ROWTYPE;
    v_descricao text;
BEGIN
    IF p_canal_confirmacao IS NOT NULL
       AND p_canal_confirmacao NOT IN ('telefone', 'whatsapp', 'outro') THEN
        RAISE EXCEPTION 'Canal de confirmação inválido';
    END IF;

    UPDATE public.ordens_fornecimento
    SET
        status = 'em_entrega',
        recebido_em = NOW(),
        recebido_por = p_atualizado_por,
        atualizado_por = p_atualizado_por
    WHERE id = p_id
      AND status = 'enviada'
    RETURNING * INTO v_ordem;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok', false,
            'message',
            'Ordem não encontrada ou recebimento já confirmado. Apenas ordens enviadas podem ter o recebimento confirmado.'
        );
    END IF;

    v_descricao :=
        'Recebimento da Ordem de Fornecimento '
        || v_ordem.numero
        || ' confirmado manualmente por usuário autorizado';

    IF p_canal_confirmacao IS NOT NULL THEN
        v_descricao := v_descricao
            || '. Canal de confirmação: '
            || p_canal_confirmacao
            || '.';
    END IF;

    INSERT INTO public.historico_pacientes (
        paciente_id,
        usuario_id,
        tipo_evento,
        descricao,
        referencia_id,
        idempotency_key
    )
    VALUES (
        v_ordem.paciente_id,
        p_atualizado_por,
        'OF_RECEBIMENTO_CONFIRMADO',
        v_descricao,
        v_ordem.id,
        'of_recebimento_confirmado_' || v_ordem.id::text
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'ok', true,
        'id', v_ordem.id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_recebimento_ordem(uuid, uuid, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.confirmar_recebimento_ordem(uuid, uuid, text)
TO service_role;
