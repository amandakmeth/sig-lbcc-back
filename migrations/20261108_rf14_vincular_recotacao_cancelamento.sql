ALTER TABLE public.solicitacoes_cancelamento_ordem
ADD COLUMN IF NOT EXISTS recotacao_id UUID
REFERENCES public.cotacoes(id)
ON DELETE SET NULL;