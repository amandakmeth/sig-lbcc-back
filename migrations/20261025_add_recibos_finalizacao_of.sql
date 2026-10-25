
CREATE TABLE IF NOT EXISTS public.ordens_fornecimento_recibos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    ordem_fornecimento_id UUID NOT NULL UNIQUE
        REFERENCES public.ordens_fornecimento(id)
        ON DELETE RESTRICT,

    status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (
            status IN (
                'pendente',
                'enviando',
                'enviado',
                'falhou'
            )
        ),

    destinatario_email TEXT,
    nome_arquivo TEXT,
    pdf_base64 TEXT,
    message_id TEXT,
    erro TEXT,

    tentativas INTEGER NOT NULL DEFAULT 0
        CHECK (tentativas >= 0),

    solicitado_por UUID
        REFERENCES public.usuarios(id)
        ON DELETE SET NULL,

    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    enviado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS
    idx_of_recibos_status_atualizado
ON public.ordens_fornecimento_recibos (
    status,
    atualizado_em
);

ALTER TABLE public.ordens_fornecimento_recibos
    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ordens_fornecimento_recibos
    FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE
    ON TABLE public.ordens_fornecimento_recibos
    TO service_role;
