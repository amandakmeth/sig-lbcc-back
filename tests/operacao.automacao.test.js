import 'dotenv/config'
import {
    AUTOMACAO_EXECUTION_STATUS,
    resumirMetricas
} from '../src/modules/operacao/services/automacao.service.js'
import {
    diagnosticarInconsistencias
} from '../src/modules/notificacoes/services/proximidade.job.js'

describe('operacao da automacao de prazos', () => {
    it('normaliza metricas para o registro operacional', () => {
        expect(resumirMetricas({
            examinadas: 8,
            transicionadas: 2,
            notificacoesCriadas: 3,
            emailsEnviados: 1,
            erros: 2,
            retentativas: 4,
            inconsistencias: 1
        })).toEqual({
            ordens_examinadas: 8,
            ordens_afetadas: 2,
            notificacoes_criadas: 3,
            emails_enviados: 1,
            falhas: 2,
            retentativas: 4,
            inconsistencias: 1
        })
    })

    it('diagnostica dependencias ausentes sem transformar a ordem em excecao', () => {
        expect(diagnosticarInconsistencias({
            id: 'of-1',
            numero: 'OF-2026-0001',
            fornecedor_id: null,
            cotacao_id: null,
            paciente_id: null,
            fornecedores: null,
            cotacoes: null,
            pacientes: null,
            ordem_fornecimento_responsaveis: []
        }).map((item) => item.tipo)).toEqual([
            'FORNECEDOR_AUSENTE',
            'COTACAO_AUSENTE',
            'PACIENTE_AUSENTE',
            'GESTORES_RESPONSAVEIS_AUSENTES'
        ])
    })

    it('mantem os estados operacionais de execucao explicitos', () => {
        expect(AUTOMACAO_EXECUTION_STATUS).toMatchObject({
            EXECUTANDO: 'executando',
            CONCLUIDA: 'concluida',
            IGNORADA: 'ignorada'
        })
    })
})
