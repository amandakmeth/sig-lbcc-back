ALTER TABLE public.solicitacoes_cancelamento_ordem
    ALTER COLUMN divergencia_id DROP NOT NULL;

ALTER TABLE public.solicitacoes_cancelamento_ordem
    ADD COLUMN IF NOT EXISTS necessidade_paciente TEXT
    CHECK (necessidade_paciente IN ('continua', 'encerrada'));

CREATE OR REPLACE FUNCTION public.solicitar_cancelamento_ordem_rf14(
    p_ordem_fornecimento_id UUID,
    p_ordem_transporte_id UUID,
    p_motivo TEXT,
    p_necessidade_paciente TEXT,
    p_usuario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_status TEXT;
    v_paciente_id UUID;
    v_numero_ordem TEXT;
    v_solicitacao public.solicitacoes_cancelamento_ordem%ROWTYPE;
BEGIN
    IF (
        (p_ordem_fornecimento_id IS NOT NULL AND p_ordem_transporte_id IS NOT NULL)
        OR
        (p_ordem_fornecimento_id IS NULL AND p_ordem_transporte_id IS NULL)
    ) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ORDEM_INVALIDA',
            'message', 'Informe exatamente uma ordem para cancelamento.');
    END IF;

    IF COALESCE(trim(p_motivo), '') = ''
        OR p_usuario_id IS NULL
        OR p_necessidade_paciente IS NULL
        OR p_necessidade_paciente NOT IN ('continua', 'encerrada') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DADOS_OBRIGATORIOS',
            'message', 'Informe o motivo e a situação da necessidade do paciente.');
    END IF;

    IF p_ordem_fornecimento_id IS NOT NULL THEN
        SELECT status, paciente_id, numero
        INTO v_status, v_paciente_id, v_numero_ordem
        FROM public.ordens_fornecimento
        WHERE id = p_ordem_fornecimento_id FOR UPDATE;
    ELSE
        SELECT status, paciente_id, numero
        INTO v_status, v_paciente_id, v_numero_ordem
        FROM public.ordens_transporte
        WHERE id = p_ordem_transporte_id FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ORDEM_NAO_ENCONTRADA',
            'message', 'Ordem não encontrada.');
    END IF;

    IF v_status IN ('finalizada', 'cancelada') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ORDEM_NAO_CANCELAVEL',
            'message', 'A ordem já foi finalizada ou cancelada.');
    END IF;

    INSERT INTO public.solicitacoes_cancelamento_ordem (
        ordem_fornecimento_id, ordem_transporte_id, motivo,
        solicitado_por, necessidade_paciente
    )
    VALUES (
        p_ordem_fornecimento_id, p_ordem_transporte_id,
        trim(p_motivo), p_usuario_id, p_necessidade_paciente
    )
    RETURNING * INTO v_solicitacao;

    INSERT INTO public.historico_pacientes (
        paciente_id, tipo_evento, descricao, referencia_id,
        usuario_id, idempotency_key
    )
    VALUES (
        v_paciente_id,
        'ALTERACAO_STATUS',
        'Solicitação de cancelamento da ordem ' || v_numero_ordem ||
            ' aberta. Motivo: ' || v_solicitacao.motivo,
        COALESCE(v_solicitacao.ordem_fornecimento_id, v_solicitacao.ordem_transporte_id),
        p_usuario_id,
        'cancelamento:' || v_solicitacao.id::TEXT || ':historico_solicitacao'
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    INSERT INTO public.auditoria_eventos (
        entidade_tipo, entidade_id, acao, usuario_id, dados, idempotency_key
    )
    VALUES (
        CASE
            WHEN p_ordem_fornecimento_id IS NOT NULL THEN 'ordem_fornecimento'
            ELSE 'ordem_transporte'
        END,
        COALESCE(p_ordem_fornecimento_id, p_ordem_transporte_id),
        'CANCELAMENTO_SOLICITADO_RF_F14',
        p_usuario_id,
        jsonb_build_object(
            'solicitacao_id', v_solicitacao.id,
            'numero_ordem', v_numero_ordem,
            'motivo', v_solicitacao.motivo,
            'necessidade_paciente', v_solicitacao.necessidade_paciente
        ),
        'cancelamento:' || v_solicitacao.id::TEXT || ':solicitacao'
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object('ok', true, 'solicitacao', to_jsonb(v_solicitacao));

EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CANCELAMENTO_PENDENTE',
        'message', 'Já existe uma solicitação aguardando decisão para esta ordem.');
END;
$function$;

REVOKE ALL ON FUNCTION public.solicitar_cancelamento_ordem_rf14(UUID, UUID, TEXT, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.solicitar_cancelamento_ordem_rf14(UUID, UUID, TEXT, TEXT, UUID)
    TO service_role;

    ALTER TABLE public.cotacoes
    ADD COLUMN IF NOT EXISTS cotacao_origem_id UUID
        REFERENCES public.cotacoes(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS ordem_fornecimento_origem_id UUID
        REFERENCES public.ordens_fornecimento(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.decidir_cancelamento_ordem_rf14(
    p_solicitacao_id UUID,
    p_aprovado BOOLEAN,
    p_justificativa TEXT,
    p_gerar_recotacao BOOLEAN,
    p_data_validade_recotacao DATE,
    p_usuario_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_solicitacao public.solicitacoes_cancelamento_ordem%ROWTYPE;
    v_ordem public.ordens_fornecimento%ROWTYPE;
    v_cotacao public.cotacoes%ROWTYPE;
    v_nova_cotacao_id UUID;
    v_validade DATE;
    v_itens_restantes BOOLEAN;
    v_itens_criados INTEGER := 0;
    v_perfil TEXT;
    v_paciente_id UUID;
BEGIN
    SELECT perfil INTO v_perfil
    FROM public.usuarios
    WHERE id = p_usuario_id AND ativo = true;

    IF v_perfil IS DISTINCT FROM 'gestor' THEN
        RETURN jsonb_build_object(
            'ok', false, 'code', 'SEM_PERMISSAO',
            'message', 'Somente gestores podem decidir o cancelamento.'
        );
    END IF;

    IF p_aprovado IS NULL
        OR COALESCE(trim(p_justificativa), '') = ''
        OR p_usuario_id IS NULL THEN
        RETURN jsonb_build_object(
            'ok', false, 'code', 'DADOS_OBRIGATORIOS',
            'message', 'Informe a decisão e sua justificativa.'
        );
    END IF;

    SELECT * INTO v_solicitacao
    FROM public.solicitacoes_cancelamento_ordem
    WHERE id = p_solicitacao_id
    FOR UPDATE;

    IF NOT FOUND OR v_solicitacao.divergencia_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'ok', false, 'code', 'SOLICITACAO_NAO_ENCONTRADA',
            'message', 'Solicitação direta de cancelamento não encontrada.'
        );
    END IF;

    IF v_solicitacao.status <> 'solicitada' THEN
        RETURN jsonb_build_object(
            'ok', false, 'code', 'CANCELAMENTO_JA_DECIDIDO',
            'message', 'Esta solicitação já foi decidida.'
        );
    END IF;

    IF v_solicitacao.ordem_fornecimento_id IS NOT NULL THEN
        SELECT paciente_id INTO v_paciente_id
        FROM public.ordens_fornecimento
        WHERE id = v_solicitacao.ordem_fornecimento_id;
    ELSE
        SELECT paciente_id INTO v_paciente_id
        FROM public.ordens_transporte
        WHERE id = v_solicitacao.ordem_transporte_id;
    END IF;

    IF p_aprovado
        AND v_solicitacao.ordem_fornecimento_id IS NOT NULL THEN

        SELECT * INTO v_ordem
        FROM public.ordens_fornecimento
        WHERE id = v_solicitacao.ordem_fornecimento_id
        FOR UPDATE;

        IF NOT FOUND OR v_ordem.status IN ('finalizada', 'cancelada') THEN
            RETURN jsonb_build_object(
                'ok', false, 'code', 'ORDEM_NAO_CANCELAVEL',
                'message', 'A ordem já foi finalizada ou cancelada.'
            );
        END IF;

        IF p_gerar_recotacao AND v_solicitacao.necessidade_paciente <> 'continua' THEN
            RETURN jsonb_build_object(
                'ok', false, 'code', 'NECESSIDADE_ENCERRADA',
                'message', 'Não é possível gerar recotação quando a necessidade do paciente foi encerrada.'
            );
        END IF;

        v_paciente_id := v_ordem.paciente_id;

        IF EXISTS (
            SELECT 1
            FROM public.ordem_fornecimento_itens oi
            WHERE oi.ordem_fornecimento_id = v_ordem.id
        )
        AND NOT EXISTS (
            SELECT 1
            FROM public.ordem_fornecimento_itens oi
            WHERE oi.ordem_fornecimento_id = v_ordem.id
                AND oi.quantidade_solicitada > (
                    COALESCE(oi.quantidade_entregue_legado, 0)
                    + COALESCE((
                        SELECT SUM(ci.quantidade)
                        FROM public.comprovacoes_of_itens ci
                        JOIN public.comprovacoes_of c
                            ON c.id = ci.comprovacao_id
                        WHERE ci.ordem_fornecimento_item_id = oi.id
                        AND c.ordem_fornecimento_id = v_ordem.id
                    ), 0)
                )
        ) THEN
            RETURN jsonb_build_object(
                'ok', false,
                'code', 'OF_TOTALMENTE_COMPROVADA',
                'message', 'Não é possível cancelar uma ordem com todos os itens integralmente comprovados.'
            );
        END IF;

        IF p_gerar_recotacao THEN
            SELECT * INTO v_cotacao
            FROM public.cotacoes
            WHERE id = v_ordem.cotacao_id;

            IF NOT FOUND THEN
                RETURN jsonb_build_object(
                    'ok', false, 'code', 'COTACAO_ORIGINAL_NAO_ENCONTRADA',
                    'message', 'Cotação original da ordem não encontrada.'
                );
            END IF;

            v_validade := v_cotacao.data_validade;

            IF v_validade < CURRENT_DATE THEN
                IF p_data_validade_recotacao IS NULL
                    OR p_data_validade_recotacao <= CURRENT_DATE THEN
                    RETURN jsonb_build_object(
                        'ok', false, 'code', 'NOVA_VALIDADE_OBRIGATORIA',
                        'message', 'Informe uma nova data de validade futura para a recotação.'
                    );
                END IF;

                v_validade := p_data_validade_recotacao;
            END IF;

            SELECT EXISTS (
                SELECT 1
                FROM public.ordem_fornecimento_itens oi
                WHERE oi.ordem_fornecimento_id = v_ordem.id
                    AND oi.quantidade_solicitada > (
                        COALESCE(oi.quantidade_entregue_legado, 0)
                        + COALESCE((
                            SELECT SUM(ci.quantidade)
                            FROM public.comprovacoes_of_itens ci
                            JOIN public.comprovacoes_of c
                                ON c.id = ci.comprovacao_id
                            WHERE ci.ordem_fornecimento_item_id = oi.id
                            AND c.ordem_fornecimento_id = v_ordem.id
                        ), 0)
                    )
            ) INTO v_itens_restantes;

            IF NOT v_itens_restantes THEN
                RETURN jsonb_build_object(
                    'ok', false, 'code', 'SEM_ITENS_PENDENTES',
                    'message', 'Não existem itens não atendidos para recotar.'
                );
            END IF;

            INSERT INTO public.cotacoes (
                data_abertura,
                data_validade,
                descricao,
                status,
                created_by,
                paciente_id,
                area_id,
                ativo
            )
            VALUES (
                CURRENT_DATE,
                v_validade,
                'Recotação da cotação ' || COALESCE(v_cotacao.numero, v_cotacao.id::TEXT),
                'rascunho'::public.status_cotacao,
                p_usuario_id,
                v_ordem.paciente_id,
                v_cotacao.area_id,
                true
            )
            RETURNING id INTO v_nova_cotacao_id;
            
            UPDATE public.cotacoes
            SET cotacao_origem_id = v_cotacao.id,
                ordem_fornecimento_origem_id = v_ordem.id
            WHERE id = v_nova_cotacao_id;

            INSERT INTO public.cotacao_itens (
                cotacao_id,
                produto_id,
                descricao,
                quantidade,
                unidade,
                especificacoes,
                ordem
            )
            SELECT
                v_nova_cotacao_id,
                oi.produto_id,
                oi.descricao,
                oi.quantidade_solicitada - (
                    COALESCE(oi.quantidade_entregue_legado, 0)
                    + COALESCE((
                        SELECT SUM(ci2.quantidade)
                        FROM public.comprovacoes_of_itens ci2
                        JOIN public.comprovacoes_of c
                            ON c.id = ci2.comprovacao_id
                        WHERE ci2.ordem_fornecimento_item_id = oi.id
                            AND c.ordem_fornecimento_id = v_ordem.id
                    ), 0)
                ),
                oi.unidade,
                ci.especificacoes,
                COALESCE(ci.ordem, 0)
            FROM public.ordem_fornecimento_itens oi
            LEFT JOIN public.cotacao_itens ci
                ON ci.id = oi.cotacao_item_id
            WHERE oi.ordem_fornecimento_id = v_ordem.id
                AND oi.quantidade_solicitada > (
                    COALESCE(oi.quantidade_entregue_legado, 0)
                    + COALESCE((
                        SELECT SUM(ci2.quantidade)
                        FROM public.comprovacoes_of_itens ci2
                        JOIN public.comprovacoes_of c
                            ON c.id = ci2.comprovacao_id
                        WHERE ci2.ordem_fornecimento_item_id = oi.id
                        AND c.ordem_fornecimento_id = v_ordem.id
                    ), 0)
                );

            GET DIAGNOSTICS v_itens_criados = ROW_COUNT;

            IF v_itens_criados = 0 THEN
                RAISE EXCEPTION 'Não foi possível criar os itens da recotação.';
            END IF;
        END IF;

        UPDATE public.ordens_fornecimento
        SET status = 'cancelada',
            atualizado_por = p_usuario_id,
            updated_at = NOW()
        WHERE id = v_ordem.id;

    ELSIF p_aprovado
        AND v_solicitacao.ordem_transporte_id IS NOT NULL THEN

        IF p_gerar_recotacao THEN
            RETURN jsonb_build_object(
                'ok', false, 'code', 'RECOTACAO_NAO_APLICAVEL_OT',
                'message', 'A recotação de fornecimento não se aplica à ordem de transporte.'
            );
        END IF;

        UPDATE public.ordens_transporte
        SET status = 'cancelada',
            updated_at = NOW()
        WHERE id = v_solicitacao.ordem_transporte_id
            AND status NOT IN ('finalizada', 'cancelada')
        RETURNING paciente_id INTO v_paciente_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'ok', false, 'code', 'ORDEM_NAO_CANCELAVEL',
                'message', 'A ordem de transporte já foi finalizada ou cancelada.'
            );
        END IF;

        UPDATE public.ordem_transporte_vouchers
        SET invalidado_em = NOW(),
            invalidado_por = p_usuario_id,
            motivo_invalidacao = trim(p_justificativa)
        WHERE ordem_transporte_id = v_solicitacao.ordem_transporte_id
            AND invalidado_em IS NULL;
    END IF;

    UPDATE public.solicitacoes_cancelamento_ordem
    SET status = CASE WHEN p_aprovado THEN 'aprovada' ELSE 'recusada' END,
        justificativa_decisao = trim(p_justificativa),
        decidido_por = p_usuario_id,
        decidido_em = NOW()
    WHERE id = p_solicitacao_id
    RETURNING * INTO v_solicitacao;

    INSERT INTO public.historico_pacientes (
        paciente_id, tipo_evento, descricao,
        referencia_id, usuario_id, idempotency_key
    )
    VALUES (
        v_paciente_id,
        'ALTERACAO_STATUS',
        CASE
            WHEN p_aprovado THEN 'Cancelamento aprovado.'
            ELSE 'Solicitação de cancelamento recusada.'
        END ||
        ' Motivo: ' || v_solicitacao.motivo ||
        '. Justificativa: ' || trim(p_justificativa),
        COALESCE(v_solicitacao.ordem_fornecimento_id, v_solicitacao.ordem_transporte_id),
        p_usuario_id,
        'cancelamento:' || v_solicitacao.id::TEXT || ':historico_decisao'
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    INSERT INTO public.auditoria_eventos (
        entidade_tipo, entidade_id, acao, usuario_id, dados, idempotency_key
    )
    VALUES (
        CASE
            WHEN v_solicitacao.ordem_fornecimento_id IS NOT NULL
                THEN 'ordem_fornecimento'
            ELSE 'ordem_transporte'
        END,
        COALESCE(v_solicitacao.ordem_fornecimento_id, v_solicitacao.ordem_transporte_id),
        CASE WHEN p_aprovado THEN 'CANCELAMENTO_APROVADO_RF_F14'
                ELSE 'CANCELAMENTO_RECUSADO_RF_F14' END,
        p_usuario_id,
        jsonb_build_object(
            'solicitacao_id', v_solicitacao.id,
            'motivo', v_solicitacao.motivo,
            'justificativa', trim(p_justificativa),
            'necessidade_paciente', v_solicitacao.necessidade_paciente,
            'recotacao_id', v_nova_cotacao_id
        ),
        'cancelamento:' || v_solicitacao.id::TEXT || ':decisao'
    );

    RETURN jsonb_build_object(
        'ok', true,
        'solicitacao', to_jsonb(v_solicitacao),
        'ordem_cancelada', p_aprovado,
        'recotacao_id', v_nova_cotacao_id,
        'itens_recotados', v_itens_criados
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.decidir_cancelamento_ordem_rf14(UUID, BOOLEAN, TEXT, BOOLEAN, DATE, UUID)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.decidir_cancelamento_ordem_rf14(UUID, BOOLEAN, TEXT, BOOLEAN, DATE, UUID)
    TO service_role;


