ALTER TABLE cotacao_proposta_itens
  ADD COLUMN IF NOT EXISTS selecionada boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cotacao_proposta_itens_vencedor_por_item
  ON cotacao_proposta_itens (item_id)
  WHERE selecionada = true;
