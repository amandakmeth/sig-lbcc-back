
BEGIN;

-- Permite criar a OT antes de preencher os dados operacionais.
ALTER TABLE public.ordens_transporte
    ALTER COLUMN tipo_combustivel DROP NOT NULL,
    ALTER COLUMN quantidade_autorizada DROP NOT NULL,
    ALTER COLUMN posto_abastecimento DROP NOT NULL,
    ALTER COLUMN validade_ate DROP NOT NULL;

-- Permite que a validade fique vazia enquanto a ordem está pendente.
ALTER TABLE public.ordens_transporte
    DROP CONSTRAINT IF EXISTS ordem_transporte_validade_check;

ALTER TABLE public.ordens_transporte
    ADD CONSTRAINT ordem_transporte_validade_check
    CHECK (
        validade_ate IS NULL
        OR validade_ate >= data_emissao::DATE
    );

-- Adiciona o estado pendente sem remover os estados existentes.
ALTER TABLE public.ordens_transporte
    DROP CONSTRAINT IF EXISTS ordens_transporte_status_check;

ALTER TABLE public.ordens_transporte
    ADD CONSTRAINT ordens_transporte_status_check
    CHECK (
        status IN (
            'pendente',
            'emitida',
            'entregue',
            'utilizacao_comprovada',
            'finalizada',
            'vencida',
            'cancelada'
        )
    );

COMMIT;
