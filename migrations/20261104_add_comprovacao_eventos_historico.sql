-- Novos eventos de histórico usados pela migration de comprovações e divergências.
-- Manter esta alteração em uma migration separada garante o commit dos valores
-- antes das funções PL/pgSQL começarem a gravar esses eventos.
ALTER TYPE public.tipo_evento_historico
    ADD VALUE IF NOT EXISTS 'OF_COMPROVACAO_REGISTRADA';
ALTER TYPE public.tipo_evento_historico
    ADD VALUE IF NOT EXISTS 'OT_UTILIZACAO_REGISTRADA';
ALTER TYPE public.tipo_evento_historico
    ADD VALUE IF NOT EXISTS 'ORDEM_DIVERGENCIA';