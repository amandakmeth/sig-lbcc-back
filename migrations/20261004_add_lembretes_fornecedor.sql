CREATE TABLE IF NOT EXISTS lembretes_fornecedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_fornecimento_id uuid NOT NULL REFERENCES ordens_fornecimento(id) ON DELETE CASCADE,
  prazo_ciclo integer NOT NULL,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'enviado', 'falha_recuperavel', 'falha_definitiva')),
  tentativas_realizadas integer NOT NULL DEFAULT 0,
  proxima_tentativa_em timestamptz,
  ultima_tentativa_em timestamptz,
  ultimo_destinatario_email text,
  ultimo_erro text,
  ultimo_metadado jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ordem_fornecimento_id, prazo_ciclo)
);

CREATE INDEX IF NOT EXISTS idx_lembretes_fornecedor_pendentes
  ON lembretes_fornecedor(status, proxima_tentativa_em);

CREATE TABLE IF NOT EXISTS lembretes_fornecedor_tentativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lembrete_fornecedor_id uuid NOT NULL REFERENCES lembretes_fornecedor(id) ON DELETE CASCADE,
  numero_tentativa integer NOT NULL,
  status text NOT NULL
    CHECK (status IN ('processando', 'enviado', 'falha_recuperavel', 'falha_definitiva')),
  destinatario_email text,
  erro text,
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lembrete_fornecedor_id, numero_tentativa)
);

CREATE INDEX IF NOT EXISTS idx_lembretes_fornecedor_tentativas_lembrete
  ON lembretes_fornecedor_tentativas(lembrete_fornecedor_id, numero_tentativa DESC);
