function textoPdf(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]/g, '?')
        .replaceAll('\\', '\\\\')
        .replaceAll('(', '\\(')
        .replaceAll(')', '\\)')
}

function moeda(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(Number(value || 0))
}

function data(value) {
    if (!value) return '-'
    const [ano, mes, dia] = String(value).slice(0, 10).split('-')
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : String(value)
}

function fornecedorNome(ordem) {
    return ordem?.fornecedores?.nome_fantasia
        || ordem?.fornecedores?.razao_social
        || '-'
}

function quebrarLinha(value, tamanho = 88) {
    const palavras = String(value || '').split(/\s+/)
    const linhas = []
    let atual = ''

    for (const palavra of palavras) {
        const proxima = atual ? `${atual} ${palavra}` : palavra
        if (proxima.length > tamanho && atual) {
            linhas.push(atual)
            atual = palavra
        } else {
            atual = proxima
        }
    }

    if (atual) linhas.push(atual)
    return linhas.length > 0 ? linhas : ['']
}

function montarLinhas(ordem) {
    const linhas = [
        'ORDEM DE FORNECIMENTO',
        '',
        `Numero: ${ordem.numero || '-'}`,
        `Fornecedor: ${fornecedorNome(ordem)}`,
        `Email: ${ordem.fornecedores?.email || '-'}`,
        `Data de emissao: ${data(ordem.data_emissao)}`,
        `Previsao de entrega: ${data(ordem.data_previsao_entrega)}`,
        `Valor total: ${moeda(ordem.valor_total)}`,
        '',
        'ITENS'
    ]

    for (const item of ordem.ordem_fornecimento_itens || []) {
        const quantidade = Number(item.quantidade_solicitada || 0)
        const unidade = item.unidade || ''
        linhas.push(...quebrarLinha(
            `${item.descricao || '-'} | ${quantidade} ${unidade} | ${moeda(item.valor_total)}`
        ))
    }

    if ((ordem.ordem_fornecimento_itens || []).length === 0) {
        linhas.push('Nenhum item informado.')
    }

    if (ordem.observacoes) {
        linhas.push('', 'OBSERVACOES', ...quebrarLinha(ordem.observacoes))
    }

    return linhas
}

function montarConteudo(linhas) {
    const comandos = ['BT', '/F1 12 Tf', '50 790 Td']

    linhas.slice(0, 47).forEach((linha, index) => {
        if (index > 0) comandos.push('0 -16 Td')
        comandos.push(`(${textoPdf(linha)}) Tj`)
    })

    comandos.push('ET')
    return comandos.join('\n')
}

export function buildOrderPdf(ordem) {
    const content = montarConteudo(montarLinhas(ordem))
    const objetos = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`
    ]

    const partes = ['%PDF-1.4\n%\xE2\xE3\xCF\xD3\n']
    const offsets = [0]

    objetos.forEach((objeto, index) => {
        offsets.push(Buffer.byteLength(partes.join(''), 'binary'))
        partes.push(`${index + 1} 0 obj\n${objeto}\nendobj\n`)
    })

    const inicioXref = Buffer.byteLength(partes.join(''), 'binary')
    partes.push(`xref\n0 ${objetos.length + 1}\n`)
    partes.push('0000000000 65535 f \n')
    for (let index = 1; index < offsets.length; index += 1) {
        partes.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`)
    }
    partes.push(`trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`)

    return Buffer.from(partes.join(''), 'binary')
}

export function nomeArquivoPdf(ordem) {
    return `${String(ordem?.numero || ordem?.id || 'ordem-fornecimento')}.pdf`
}
