CREATE TABLE IF NOT EXISTS public.areas_produtos (
    area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE RESTRICT,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (area_id, produto_id)
);

CREATE TABLE IF NOT EXISTS public.fornecedores_produtos (
    fornecedor_id UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE RESTRICT,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (fornecedor_id, produto_id)
);

CREATE INDEX IF NOT EXISTS idx_areas_produtos_produto
    ON public.areas_produtos(produto_id);

CREATE INDEX IF NOT EXISTS idx_fornecedores_produtos_produto
    ON public.fornecedores_produtos(produto_id);
