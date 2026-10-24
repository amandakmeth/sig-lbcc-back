function textoPdf(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]/g, '?')
        .replaceAll('\\', '\\\\')
        .replaceAll('(', '\\(')
        .replaceAll(')', '\\)');
}

function dataFormatada(value) {
    if (!value) return '-';

    const [ano, mes, dia] = String(value).slice(0, 10).split('-');

    return ano && mes && dia
        ? `${dia}/${mes}/${ano}`
        : String(value);
}

function quebrarLinha(value, tamanho = 78) {
    const palavras = String(value || '-').split(/\s+/);
    const linhas = [];
    let atual = '';

    for (const palavra of palavras) {
        const proxima = atual ? `${atual} ${palavra}` : palavra;

        if (proxima.length > tamanho && atual) {
            linhas.push(atual);
            atual = palavra;
        } else {
            atual = proxima;
        }
    }

    if (atual) linhas.push(atual);

    return linhas.length ? linhas : ['-'];
}

function montarLinhasVoucher(ordem, voucher) {
    const fornecedor = ordem.fornecedor || ordem.fornecedores || {};
    const paciente = ordem.paciente || ordem.pacientes || {};

    return [
        'VOUCHER DE TRANSPORTE - ABASTECIMENTO',
        '',
        `Ordem de Transporte: ${ordem.numero || ordem.id || '-'}`,
        `Codigo do voucher: ${voucher.codigo || '-'}`,
        `Via: ${voucher.tipo_via === 'segunda_via' ? 'SEGUNDA VIA' : 'ORIGINAL'} (${voucher.numero_via || 1})`,
        '',
        'DADOS DO BENEFICIARIO',
        `Paciente: ${paciente.nome || ordem.paciente_nome || '-'}`,
        '',
        'DADOS DO FORNECEDOR',
        `Fornecedor: ${fornecedor.nome_fantasia || fornecedor.razao_social || '-'}`,
        '',
        'AUTORIZACAO DE ABASTECIMENTO',
        `Combustivel: ${ordem.tipo_combustivel || '-'}`,
        `Quantidade autorizada: ${ordem.quantidade_autorizada ?? '-'}`,
        `Posto de abastecimento: ${ordem.posto_abastecimento || '-'}`,
        `Placa do veiculo: ${ordem.veiculo_placa || 'Nao informada'}`,
        '',
        `Data de emissao: ${dataFormatada(ordem.data_emissao)}`,
        `Valido ate: ${dataFormatada(ordem.validade_ate)}`,
        `Status da OT: ${ordem.status || '-'}`,
        '',
        'Apresente este voucher ao responsavel pelo abastecimento.',
        'A entrega do voucher nao comprova a utilizacao do combustivel.',
        ...(ordem.observacoes
            ? ['', 'OBSERVACOES', ...quebrarLinha(ordem.observacoes)]
            : [])
    ];
}

function montarConteudo(linhas) {
    const comandos = ['BT', '/F1 11 Tf', '50 790 Td'];

    linhas.slice(0, 47).forEach((linha, index) => {
        if (index > 0) comandos.push('0 -16 Td');
        comandos.push(`(${textoPdf(linha)}) Tj`);
    });

    comandos.push('ET');

    return comandos.join('\n');
}

export function buildVoucherTransportePdf(ordem, voucher) {
    const content = montarConteudo(montarLinhasVoucher(ordem, voucher));

    const objetos = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`
    ];

    const partes = ['%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'];
    const offsets = [0];

    objetos.forEach((objeto, index) => {
        offsets.push(Buffer.byteLength(partes.join(''), 'binary'));
        partes.push(`${index + 1} 0 obj\n${objeto}\nendobj\n`);
    });

    const inicioXref = Buffer.byteLength(partes.join(''), 'binary');

    partes.push(`xref\n0 ${objetos.length + 1}\n`);
    partes.push('0000000000 65535 f \n');

    for (let index = 1; index < offsets.length; index += 1) {
        partes.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
    }

    partes.push(
        `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`
    );

    return Buffer.from(partes.join(''), 'binary');
}

export function nomeArquivoVoucherTransporte(ordem, voucher) {
    const numero = ordem?.numero || ordem?.id || 'ordem-transporte';
    const via = voucher?.numero_via || 1;

    return `${numero}-voucher-via-${via}.pdf`;
}
