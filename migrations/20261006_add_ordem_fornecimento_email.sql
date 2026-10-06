ALTER TABLE ordens_fornecimento
  ADD COLUMN IF NOT EXISTS status_envio text NOT NULL DEFAULT 'nao_enviado',
  ADD COLUMN IF NOT EXISTS email_envio_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_envio_proxima_tentativa timestamptz,
  ADD COLUMN IF NOT EXISTS email_envio_ultimo_erro text,
  ADD COLUMN IF NOT EXISTS email_envio_ultima_tentativa_em timestamptz,
  ADD COLUMN IF NOT EXISTS email_envio_ultimo_sucesso_em timestamptz,
  ADD COLUMN IF NOT EXISTS recebido_em timestamptz,
  ADD COLUMN IF NOT EXISTS recebido_por uuid REFERENCES usuarios(id) ON DELETE SET NULL;

ALTER TABLE ordens_fornecimento
  DROP CONSTRAINT IF EXISTS ordens_fornecimento_status_envio_check;

ALTER TABLE ordens_fornecimento
  ADD CONSTRAINT ordens_fornecimento_status_envio_check
  CHECK (status_envio IN (
    'nao_enviado',
    'pendente',
    'enviando',
    'enviado',
    'falhou_retentando',
    'falhou_definitivo'
  ));

CREATE INDEX IF NOT EXISTS idx_ordens_fornecimento_status_envio
  ON ordens_fornecimento(status_envio, email_envio_proxima_tentativa);

CREATE TABLE IF NOT EXISTS ordens_fornecimento_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_fornecimento_id uuid NOT NULL REFERENCES ordens_fornecimento(id) ON DELETE CASCADE,
  ciclo integer NOT NULL DEFAULT 1,
  tentativa integer NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('automatico', 'manual')),
  status text NOT NULL CHECK (status IN ('pendente', 'enviando', 'enviado', 'falhou')),
  destinatario_email text,
  assunto text,
  nome_arquivo text,
  pdf_versao integer NOT NULL DEFAULT 1,
  pdf_base64 text,
  message_id text,
  erro text,
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  agendado_em timestamptz NOT NULL DEFAULT now(),
  iniciado_em timestamptz,
  enviado_em timestamptz,
  falhou_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_ordens_fornecimento_envios_ordem
  ON ordens_fornecimento_envios(ordem_fornecimento_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ordens_fornecimento_envios_pendentes
  ON ordens_fornecimento_envios(status, agendado_em);
