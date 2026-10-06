ALTER TABLE ordens_fornecimento
  ADD COLUMN IF NOT EXISTS prazo_ciclo integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status_prazo text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS prazo_atualizado_em timestamptz NOT NULL DEFAULT now();

UPDATE ordens_fornecimento
SET prazo_ciclo = 1
WHERE prazo_ciclo IS NULL OR prazo_ciclo < 1;

UPDATE ordens_fornecimento
SET status_prazo = 'normal'
WHERE status_prazo IS NULL OR status_prazo NOT IN ('normal', 'proxima_expiracao', 'atrasada');

CREATE INDEX IF NOT EXISTS idx_ordens_fornecimento_status_prazo
  ON ordens_fornecimento(status_prazo);

CREATE TABLE IF NOT EXISTS ordem_fornecimento_responsaveis (
  ordem_fornecimento_id uuid NOT NULL REFERENCES ordens_fornecimento(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ordem_fornecimento_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_ordem_fornecimento_responsaveis_usuario
  ON ordem_fornecimento_responsaveis(usuario_id);

CREATE TABLE IF NOT EXISTS ordem_fornecimento_prazo_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_fornecimento_id uuid NOT NULL REFERENCES ordens_fornecimento(id) ON DELETE CASCADE,
  ciclo integer NOT NULL,
  data_limite date,
  status_prazo text NOT NULL,
  tipo_evento text NOT NULL,
  responsavel_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ordem_prazo_historico_ordem
  ON ordem_fornecimento_prazo_historico(ordem_fornecimento_id, ciclo, created_at DESC);

CREATE TABLE IF NOT EXISTS calendario_feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL UNIQUE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendario_feriados_data_ativo
  ON calendario_feriados(data, ativo);

CREATE TABLE IF NOT EXISTS auditoria_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo text NOT NULL,
  entidade_id uuid,
  acao text NOT NULL,
  usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_eventos_entidade
  ON auditoria_eventos(entidade_tipo, entidade_id, created_at DESC);
