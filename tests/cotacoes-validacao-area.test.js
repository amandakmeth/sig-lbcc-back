import { jest } from '@jest/globals';

const supabase = {
    from: jest.fn()
};

jest.unstable_mockModule('../src/config/supabase.js', () => ({
    default: supabase
}));

const { inserirCotacao } = await import(
    '../src/modules/cotacoes/services/cotacoes.service.js'
);

describe('Validação de área na cotação', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('deve rejeitar cotação sem área', async () => {
        const resultado = await inserirCotacao({
            descricao: 'Cotação teste',
            data_validade: '2026-12-31',
            paciente_id: 'paciente-teste',
            itens: []
        });

        expect(resultado.error.message).toBe(
            'A área da cotação é obrigatória'
        );
        expect(supabase.from).not.toHaveBeenCalled();
    });

    it('deve rejeitar produto não vinculado à área selecionada', async () => {
        const builder = {
            select: jest.fn(),
            eq: jest.fn(),
            maybeSingle: jest.fn(),
            in: jest.fn()
        };

        builder.select.mockReturnValue(builder);
        builder.eq.mockReturnValue(builder);
        builder.in.mockReturnValue(builder);

        builder.maybeSingle.mockResolvedValue({
            data: { id: 'area-1', ativo: true },
            error: null
        });

        builder.in
            .mockResolvedValueOnce({
                data: [{ id: 'produto-1', ativo: true }],
                error: null
            })
            .mockResolvedValueOnce({
                data: [],
                error: null
            });

        supabase.from.mockReturnValue(builder);

        const resultado = await inserirCotacao({
            descricao: 'Cotação teste',
            data_validade: '2026-12-31',
            paciente_id: 'paciente-teste',
            area_id: 'area-1',
            itens: [
                {
                    produto_id: 'produto-1',
                    descricao: 'Produto teste',
                    quantidade: 1,
                    unidade: 'UN'
                }
            ]
        });

        expect(resultado.error.message).toBe(
            'Um ou mais produtos não estão vinculados à área selecionada'
        );
    });
});
