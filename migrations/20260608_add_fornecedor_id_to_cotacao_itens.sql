ALTER TABLE cotacao_itens
  ADD COLUMN IF NOT EXISTS fornecedor_id uuid
  REFERENCES fornecedores(id);

CREATE INDEX IF NOT EXISTS idx_cotacao_itens_fornecedor_id
  ON cotacao_itens(fornecedor_id);
