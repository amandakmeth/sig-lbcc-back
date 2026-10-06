import { jest } from '@jest/globals'

const publicDb = {
    from: jest.fn()
}

const single = jest.fn()
const select = jest.fn(() => ({ single }))
const insert = jest.fn(() => ({ select }))
const updateSelect = jest.fn(() => ({ single }))
const updateEq = jest.fn(() => ({ select: updateSelect }))
const update = jest.fn(() => ({ eq: updateEq }))
const adminDb = {
    from: jest.fn(() => ({ insert, update }))
}

jest.unstable_mockModule('../src/config/supabase.js', () => ({ default: publicDb }))
jest.unstable_mockModule('../src/config/supabaseAdmin.js', () => ({ default: adminDb }))

const {
    inserirFeriado,
    atualizarFeriado,
    alterarStatusFeriado
} = await import('../src/modules/calendario/services/calendario.service.js')

describe('calendario service - persistencia', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        single.mockResolvedValue({
            data: { id: 'feriado-1' },
            error: null
        })
    })

    it('usa o cliente administrativo do backend para persistir feriados', async () => {
        await inserirFeriado({
            data: '2026-10-12',
            nome: 'Nossa Senhora',
            usuarioId: 'gestor-1'
        })

        expect(adminDb.from).toHaveBeenCalledWith('calendario_feriados')
        expect(publicDb.from).not.toHaveBeenCalled()
        expect(insert).toHaveBeenCalledWith([{
            data: '2026-10-12',
            nome: 'Nossa Senhora',
            ativo: true,
            criado_por: 'gestor-1',
            atualizado_por: 'gestor-1'
        }])
    })

    it('usa o cliente administrativo para atualizar a data do feriado', async () => {
        await atualizarFeriado({
            id: 'feriado-1',
            data: '2026-11-02',
            nome: 'Finados',
            usuarioId: 'gestor-1'
        })

        expect(adminDb.from).toHaveBeenCalledWith('calendario_feriados')
        expect(update).toHaveBeenCalledWith(expect.objectContaining({
            data: '2026-11-02',
            nome: 'Finados',
            atualizado_por: 'gestor-1'
        }))
        expect(updateEq).toHaveBeenCalledWith('id', 'feriado-1')
    })

    it('persiste ativo=false ao inativar um feriado', async () => {
        await alterarStatusFeriado({
            id: 'feriado-1',
            ativo: false,
            usuarioId: 'gestor-1'
        })

        expect(adminDb.from).toHaveBeenCalledWith('calendario_feriados')
        expect(update).toHaveBeenCalledWith(expect.objectContaining({
            ativo: false,
            atualizado_por: 'gestor-1'
        }))
        expect(updateEq).toHaveBeenCalledWith('id', 'feriado-1')
    })
})
