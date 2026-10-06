-- Registros operacionais permitem reprocessar os prazos com rastreabilidade
-- sem depender apenas do log efemero do processo Node.
CREATE TABLE IF NOT EXISTS automacao_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_nome text NOT NULL,
  origem text NOT NULL CHECK (origem IN ('automatico', 'manual')),
  solicitante_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  holder_id text,
  status text NOT NULL CHECK (status IN ('executando', 'concluida', 'concluida_com_falhas', 'falha', 'ignorada')),
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  ordens_examinadas integer NOT NULL DEFAULT 0,
  ordens_afetadas integer NOT NULL DEFAULT 0,
  notificacoes_criadas integer NOT NULL DEFAULT 0,
  emails_enviados integer NOT NULL DEFAULT 0,
  falhas integer NOT NULL DEFAULT 0,
  retentativas integer NOT NULL DEFAULT 0,
  inconsistencias integer NOT NULL DEFAULT 0,
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automacao_execucoes_job_iniciado
  ON automacao_execucoes(job_nome, iniciado_em DESC);

CREATE INDEX IF NOT EXISTS idx_automacao_execucoes_status
  ON automacao_execucoes(status, iniciado_em DESC);

CREATE TABLE IF NOT EXISTS automacao_execucao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execucao_id uuid NOT NULL REFERENCES automacao_execucoes(id) ON DELETE CASCADE,
  ordem_fornecimento_id uuid REFERENCES ordens_fornecimento(id) ON DELETE SET NULL,
  status text NOT NULL,
  notificacoes_criadas integer NOT NULL DEFAULT 0,
  emails_enviados integer NOT NULL DEFAULT 0,
  retentativas integer NOT NULL DEFAULT 0,
  erro text,
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automacao_execucao_itens_execucao
  ON automacao_execucao_itens(execucao_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automacao_execucao_itens_ordem
  ON automacao_execucao_itens(ordem_fornecimento_id, created_at DESC);

CREATE TABLE IF NOT EXISTS automacao_leases (
  nome text PRIMARY KEY,
  holder_id text NOT NULL,
  adquirido_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pendencias_administrativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  tipo text NOT NULL,
  ordem_fornecimento_id uuid REFERENCES ordens_fornecimento(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'resolvida', 'ignorada')),
  descricao text NOT NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocorrencias integer NOT NULL DEFAULT 1,
  primeira_ocorrencia_em timestamptz NOT NULL DEFAULT now(),
  ultima_ocorrencia_em timestamptz NOT NULL DEFAULT now(),
  resolvida_em timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pendencias_administrativas_status
  ON pendencias_administrativas(status, ultima_ocorrencia_em DESC);

CREATE OR REPLACE FUNCTION adquirir_lease_automacao(
  p_nome text,
  p_holder_id text,
  p_ttl_seconds integer
)
RETURNS TABLE(nome text, holder_id text, adquirido_em timestamptz, expira_em timestamptz)
LANGUAGE sql
AS $$
  INSERT INTO automacao_leases (nome, holder_id, adquirido_em, expira_em, updated_at)
  VALUES (
    p_nome,
    p_holder_id,
    now(),
    now() + make_interval(secs => greatest(p_ttl_seconds, 1)),
    now()
  )
  ON CONFLICT (nome) DO UPDATE
  SET holder_id = EXCLUDED.holder_id,
      adquirido_em = EXCLUDED.adquirido_em,
      expira_em = EXCLUDED.expira_em,
      updated_at = EXCLUDED.updated_at
  WHERE automacao_leases.expira_em <= now()
     OR automacao_leases.holder_id = EXCLUDED.holder_id
  RETURNING nome, holder_id, adquirido_em, expira_em;
$$;

CREATE OR REPLACE FUNCTION renovar_lease_automacao(
  p_nome text,
  p_holder_id text,
  p_ttl_seconds integer
)
RETURNS boolean
LANGUAGE sql
AS $$
  UPDATE automacao_leases
  SET expira_em = now() + make_interval(secs => greatest(p_ttl_seconds, 1)),
      updated_at = now()
  WHERE nome = p_nome
    AND holder_id = p_holder_id
  RETURNING true;
$$;

CREATE OR REPLACE FUNCTION liberar_lease_automacao(
  p_nome text,
  p_holder_id text
)
RETURNS boolean
LANGUAGE sql
AS $$
  DELETE FROM automacao_leases
  WHERE nome = p_nome
    AND holder_id = p_holder_id
  RETURNING true;
$$;
