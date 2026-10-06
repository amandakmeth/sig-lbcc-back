-- Idempotency keys keep scheduled executions safe to retry. Existing records
-- remain valid because the new columns are nullable for legacy operations.
ALTER TABLE historico_pacientes
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_historico_pacientes_idempotency_key
  ON historico_pacientes(idempotency_key);

ALTER TABLE auditoria_eventos
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_auditoria_eventos_idempotency_key
  ON auditoria_eventos(idempotency_key);

ALTER TABLE ordem_fornecimento_prazo_historico
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ordem_prazo_historico_idempotency_key
  ON ordem_fornecimento_prazo_historico(idempotency_key);

CREATE TABLE IF NOT EXISTS notificacoes_internas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  link text,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  ordem_fornecimento_id uuid REFERENCES ordens_fornecimento(id) ON DELETE SET NULL,
  prazo_ciclo integer,
  data_limite date,
  status_prazo text,
  idempotency_key text,
  lida_em timestamptz,
  arquivada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notificacoes_internas_idempotency_key
  ON notificacoes_internas(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_notificacoes_internas_destinatario
  ON notificacoes_internas(destinatario_id, arquivada_em, lida_em, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notificacoes_internas_ordem_prazo
  ON notificacoes_internas(ordem_fornecimento_id, prazo_ciclo);

