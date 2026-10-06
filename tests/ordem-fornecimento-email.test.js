import 'dotenv/config'
import {
    buildOrderEmail,
    calcularProximaTentativa,
    isValidSupplierEmail
} from '../src/modules/fornecimento/services/ordem-fornecimento-email.service.js'
import {
    buildOrderPdf,
    nomeArquivoPdf
} from '../src/modules/fornecimento/services/ordem-fornecimento-pdf.service.js'
import { formatMessage } from '../src/modules/notificacoes/services/smtp.adapter.js'

const ordem = {
    id: 'of-1',
    numero: 'OF-2026-0001',
    data_emissao: '2026-10-05',
    data_previsao_entrega: '2026-10-10',
    valor_total: 123.45,
    observacoes: 'Entrega em horario comercial',
    fornecedores: {
        nome_fantasia: 'Fornecedor Teste',
        email: 'contato@fornecedor.test'
    },
    ordem_fornecimento_itens: [{
        descricao: 'Medicamento',
        quantidade_solicitada: 2,
        unidade: 'UN',
        valor_total: 123.45
    }]
}

describe('email da ordem de fornecimento', () => {
    it('monta email sem dados do paciente e com o resumo da ordem', () => {
        const email = buildOrderEmail({ ordem })

        expect(email.subject).toBe('Ordem de Fornecimento OF-2026-0001')
        expect(email.text).toContain('Fornecedor Teste')
        expect(email.text).toContain('Medicamento')
        expect(email.text).not.toContain('paciente')
        expect(email.html).toContain('Ordem de Fornecimento OF-2026-0001')
    })

    it('calcula retentativas em 1, 5 e 30 minutos', () => {
        const agora = new Date('2026-10-05T12:00:00.000Z')

        expect(calcularProximaTentativa({ agora, tentativa: 1 }).toISOString())
            .toBe('2026-10-05T12:01:00.000Z')
        expect(calcularProximaTentativa({ agora, tentativa: 2 }).toISOString())
            .toBe('2026-10-05T12:05:00.000Z')
        expect(calcularProximaTentativa({ agora, tentativa: 3 }).toISOString())
            .toBe('2026-10-05T12:30:00.000Z')
        expect(calcularProximaTentativa({ agora, tentativa: 4 })).toBeNull()
    })

    it('valida email do fornecedor', () => {
        expect(isValidSupplierEmail('contato@fornecedor.test')).toBe(true)
        expect(isValidSupplierEmail('sem-email')).toBe(false)
    })
})

describe('PDF da ordem de fornecimento', () => {
    it('gera um PDF baixavel com o numero da ordem', () => {
        const pdf = buildOrderPdf(ordem)

        expect(pdf.subarray(0, 8).toString()).toBe('%PDF-1.4')
        expect(pdf.toString('binary')).toContain('xref')
        expect(nomeArquivoPdf(ordem)).toBe('OF-2026-0001.pdf')
    })

    it('anexa o PDF em MIME multipart e preserva reply-to', () => {
        const mensagem = formatMessage({
            from: 'Sistema LBCC <no-reply@example.com>',
            to: 'contato@fornecedor.test',
            replyTo: 'contato@example.com',
            subject: 'OF-2026-0001',
            text: 'Segue a ordem.',
            attachments: [{
                filename: 'OF-2026-0001.pdf',
                contentType: 'application/pdf',
                content: Buffer.from('pdf')
            }]
        })

        expect(mensagem).toContain('multipart/mixed')
        expect(mensagem).toContain('Reply-To: contato@example.com')
        expect(mensagem).toContain('Content-Disposition: attachment; filename="OF-2026-0001.pdf"')
        expect(mensagem).toContain(Buffer.from('pdf').toString('base64'))
    })
})
