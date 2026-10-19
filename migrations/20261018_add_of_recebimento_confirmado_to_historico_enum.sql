-- Permite registrar a confirmação manual de recebimento de uma OF.
ALTER TYPE public.tipo_evento_historico
  ADD VALUE IF NOT EXISTS 'OF_RECEBIMENTO_CONFIRMADO';
