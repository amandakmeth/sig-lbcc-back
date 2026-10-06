-- The proximity job writes this event to historico_pacientes.tipo_evento.
-- Keep the migration idempotent so environments that already contain the
-- value can be deployed safely.
ALTER TYPE public.tipo_evento_historico
  ADD VALUE IF NOT EXISTS 'OF_PRAZO_PROXIMIDADE_ATINGIDA';
