CREATE OR REPLACE FUNCTION atualizar_observacoes_ordem_fornecimento(
    p_id uuid,
    p_observacoes text,
    p_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ordem ordens_fornecimento%ROWTYPE;
BEGIN
    SELECT *
      INTO v_ordem
      FROM ordens_fornecimento
     WHERE id = p_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok', false,
            'message', 'Ordem de fornecimento não encontrada'
        );
    END IF;

    UPDATE ordens_fornecimento
       SET observacoes = p_observacoes,
           atualizado_por = p_usuario_id,
           updated_at = now()
     WHERE id = p_id;

    INSERT INTO auditoria_eventos (
        entidade_tipo,
        entidade_id,
        acao,
        usuario_id,
        dados
    )
    VALUES (
        'ordem_fornecimento',
        p_id,
        'OF_OBSERVACOES_ATUALIZADAS',
        p_usuario_id,
        jsonb_build_object(
            'campo', 'observacoes',
            'valor_anterior', v_ordem.observacoes,
            'valor_novo', p_observacoes
        )
    );

    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION atualizar_observacoes_ordem_fornecimento(uuid, text, uuid)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION atualizar_observacoes_ordem_fornecimento(uuid, text, uuid)
    TO service_role;
