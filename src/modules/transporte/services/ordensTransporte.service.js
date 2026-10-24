import { randomBytes } from 'node:crypto';
import supabaseAdmin from '../../../config/supabaseAdmin.js';

function erro(message, code = 'VALIDATION_ERROR') {
    return { message, code };
}

function dataLocalHoje() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date())
        .reduce((resultado, parte) => {
            resultado[parte.type] = parte.value;
            return resultado;
        }, {});
}

function hojeISO() {
    const partes = dataLocalHoje();
    return `${partes.year}-${partes.month}-${partes.day}`;
}

function codigoVoucher() {
    return `VT-${randomBytes(16).toString('hex').toUpperCase()}`;
}

function numeroOrdem() {
    const data = new Date().toISOString()
        .replace(/[-:TZ.]/g, '')
        .slice(0, 14);

    return `OT-${data}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

function dataISOValida(valor) {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        return false;
    }

    const [ano, mes, dia] = valor.split('-').map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia));

    return (
        data.getUTCFullYear() === ano &&
        data.getUTCMonth() === mes - 1 &&
        data.getUTCDate() === dia
    );
}

function normalizarTexto(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

async function validarCotacaoTransporte(cotacaoId) {
    const { data: cotacao, error: cotacaoError } = await supabaseAdmin
        .from('cotacoes')
        .select(`
            id,
            numero,
            status,
            ativo,
            data_validade,
            paciente_id,
            area_id,
            fornecedor_vencedor_id
        `)
        .eq('id', cotacaoId)
        .maybeSingle();

    if (cotacaoError) {
        return { data: null, error: cotacaoError };
    }

    if (!cotacao) {
        return {
            data: null,
            error: erro('Cotação não encontrada.', 'COTACAO_NAO_ENCONTRADA')
        };
    }

    if (cotacao.status !== 'finalizada') {
        return {
            data: null,
            error: erro(
                'A cotação precisa estar finalizada para emitir a OT.',
                'COTACAO_NAO_FINALIZADA'
            )
        };
    }

    if (!cotacao.ativo) {
        return {
            data: null,
            error: erro('A cotação está inativa.', 'COTACAO_INATIVA')
        };
    }

    if (!cotacao.paciente_id) {
        return {
            data: null,
            error: erro(
                'A cotação não possui paciente associado.',
                'PACIENTE_OBRIGATORIO'
            )
        };
    }

    if (cotacao.data_validade && cotacao.data_validade < hojeISO()) {
        return {
            data: null,
            error: erro('A cotação está vencida.', 'COTACAO_VENCIDA')
        };
    }

    const { data: area, error: areaError } = await supabaseAdmin
        .from('areas')
        .select('id, nome, ativo')
        .eq('id', cotacao.area_id)
        .maybeSingle();

    if (areaError) {
        return { data: null, error: areaError };
    }

    if (
        !area ||
        !area.ativo ||
        normalizarTexto(area.nome) !== 'transporte urbano'
    ) {
        return {
            data: null,
            error: erro(
                'A cotação não pertence à área ativa de Transporte urbano.',
                'COTACAO_NAO_E_TRANSPORTE'
            )
        };
    }

    const { data: itens, error: itensError } = await supabaseAdmin
        .from('cotacao_itens')
        .select('id, descricao, quantidade')
        .eq('cotacao_id', cotacaoId);

    if (itensError) {
        return { data: null, error: itensError };
    }

    if (!itens?.length) {
        return {
            data: null,
            error: erro('A cotação não possui itens.', 'COTACAO_SEM_ITENS')
        };
    }

    const { data: propostas, error: propostasError } = await supabaseAdmin
        .from('cotacao_propostas')
        .select(`
            id,
            cotacao_id,
            fornecedor_id,
            cotacao_proposta_itens (
                id,
                item_id,
                selecionada
            )
        `)
        .eq('cotacao_id', cotacaoId);

    if (propostasError) {
        return { data: null, error: propostasError };
    }

    const vencedores = [];

    for (const item of itens) {
        const selecionados = [];

        for (const proposta of propostas || []) {
            for (const linha of proposta.cotacao_proposta_itens || []) {
                if (
                    linha.item_id === item.id &&
                    linha.selecionada === true
                ) {
                    selecionados.push({
                        linhaId: linha.id,
                        fornecedorId: proposta.fornecedor_id
                    });
                }
            }
        }

        if (selecionados.length !== 1) {
            return {
                data: null,
                error: erro(
                    `O item "${item.descricao || item.id}" precisa ter exatamente um vencedor.`,
                    'VENCEDOR_ITEM_INVALIDO'
                )
            };
        }

        vencedores.push(selecionados[0]);
    }

    const fornecedoresVencedores = [
        ...new Set(vencedores.map(v => v.fornecedorId))
    ];

    if (
        fornecedoresVencedores.length !== 1 ||
        !fornecedoresVencedores[0]
    ) {
        return {
            data: null,
            error: erro(
                'Todos os itens precisam ter o mesmo fornecedor vencedor para emitir uma única OT.',
                'FORNECEDORES_VENCEDORES_DIVERGENTES'
            )
        };
    }

    const fornecedorId = fornecedoresVencedores[0];

    if (
        cotacao.fornecedor_vencedor_id &&
        cotacao.fornecedor_vencedor_id !== fornecedorId
    ) {
        return {
            data: null,
            error: erro(
                'O fornecedor vencedor da cotação diverge dos vencedores dos itens.',
                'FORNECEDOR_VENCEDOR_DIVERGENTE'
            )
        };
    }

    const { data: fornecedor, error: fornecedorError } = await supabaseAdmin
        .from('fornecedores')
        .select('id, razao_social, nome_fantasia, ativo')
        .eq('id', fornecedorId)
        .maybeSingle();

    if (fornecedorError) {
        return { data: null, error: fornecedorError };
    }

    if (!fornecedor || !fornecedor.ativo) {
        return {
            data: null,
            error: erro(
                'O fornecedor vencedor não existe ou está inativo.',
                'FORNECEDOR_INATIVO'
            )
        };
    }

    return {
        data: { cotacao, itens, fornecedor },
        error: null
    };
}

export async function emitirOrdemDeTransporte({
    cotacaoId,
    veiculoPlaca = null,
    tipoCombustivel,
    quantidadeAutorizada,
    postoAbastecimento,
    validadeAte,
    observacoes = null,
    emitidoPor
}) {
    if (!cotacaoId || !emitidoPor) {
        return {
            data: null,
            error: erro('Cotação e usuário emissor são obrigatórios.')
        };
    }

    if (
        typeof tipoCombustivel !== 'string' ||
        !tipoCombustivel.trim() ||
        typeof postoAbastecimento !== 'string' ||
        !postoAbastecimento.trim()
    ) {
        return {
            data: null,
            error: erro(
                'Tipo de combustível e posto de abastecimento são obrigatórios.'
            )
        };
    }

    const quantidade = Number(quantidadeAutorizada);

    if (!Number.isFinite(quantidade) || quantidade <= 0) {
        return {
            data: null,
            error: erro(
                'A quantidade autorizada precisa ser um número positivo.'
            )
        };
    }

    if (!dataISOValida(validadeAte) || validadeAte < hojeISO()) {
        return {
            data: null,
            error: erro(
                'A validade do voucher precisa ser uma data válida igual ou posterior à data atual.'
            )
        };
    }

    const { data: contexto, error: validacaoError } =
        await validarCotacaoTransporte(cotacaoId);

    if (validacaoError) {
        return { data: null, error: validacaoError };
    }

    const { data: existente, error: existenteError } = await supabaseAdmin
        .from('ordens_transporte')
        .select('id, numero')
        .eq('cotacao_id', cotacaoId)
        .maybeSingle();

    if (existenteError) {
        return { data: null, error: existenteError };
    }

    if (existente) {
        return {
            data: null,
            error: erro(
                `Já existe uma OT para esta cotação (${existente.numero}).`,
                'OT_JA_EXISTE'
            )
        };
    }

    const { data: ordem, error: ordemError } = await supabaseAdmin
        .from('ordens_transporte')
        .insert({
            numero: numeroOrdem(),
            cotacao_id: cotacaoId,
            paciente_id: contexto.cotacao.paciente_id,
            fornecedor_id: contexto.fornecedor.id,
            veiculo_placa: veiculoPlaca?.trim() || null,
            tipo_combustivel: tipoCombustivel.trim(),
            quantidade_autorizada: quantidade,
            posto_abastecimento: postoAbastecimento.trim(),
            validade_ate: validadeAte,
            observacoes: observacoes?.trim() || null,
            status: 'emitida',
            created_by: emitidoPor
        })
        .select('*')
        .single();

    if (ordemError) {
        if (ordemError.code === '23505') {
            return {
                data: null,
                error: erro(
                    'Já existe uma OT para esta cotação.',
                    'OT_JA_EXISTE'
                )
            };
        }

        return { data: null, error: ordemError };
    }

    const { data: voucher, error: voucherError } = await supabaseAdmin
        .from('ordem_transporte_vouchers')
        .insert({
            ordem_transporte_id: ordem.id,
            numero_via: 1,
            tipo_via: 'original',
            codigo: codigoVoucher(),
            emitido_por: emitidoPor
        })
        .select('*')
        .single();

    if (voucherError) {
        const { error: cancelamentoError } = await supabaseAdmin
            .from('ordens_transporte')
            .update({
                status: 'cancelada',
                updated_at: new Date().toISOString(),
                observacoes: [
                    ordem.observacoes,
                    'Cancelada automaticamente: falha ao registrar o voucher original.'
                ].filter(Boolean).join('\n')
            })
            .eq('id', ordem.id)
            .eq('status', 'emitida');

        return {
            data: null,
            error: {
                ...erro(
                    cancelamentoError
                        ? 'Falha ao criar o voucher e ao cancelar a OT. Verifique o registro antes de tentar novamente.'
                        : 'A OT foi cancelada porque não foi possível registrar o voucher. Verifique o histórico antes de tentar novamente.',
                    'FALHA_AO_CRIAR_VOUCHER'
                ),
                detalhes: voucherError.message,
                erroCancelamento: cancelamentoError?.message || null,
                ordemId: ordem.id
            }
        };
    }

    return {
        data: {
            ...ordem,
            vouchers: [voucher],
            paciente: { id: contexto.cotacao.paciente_id },
            fornecedor: contexto.fornecedor
        },
        error: null
    };
}

export async function buscarVoucherTransporte(ordemId, voucherId) {
    if (!ordemId || !voucherId) {
        return {
            data: null,
            error: erro('Ordem de Transporte e voucher são obrigatórios.')
        };
    }

    const { data: ordem, error: ordemError } = await supabaseAdmin
        .from('ordens_transporte')
        .select('*')
        .eq('id', ordemId)
        .maybeSingle();

    if (ordemError) {
        return { data: null, error: ordemError };
    }

    if (!ordem) {
        return {
            data: null,
            error: erro(
                'Ordem de Transporte não encontrada.',
                'OT_NAO_ENCONTRADA'
            )
        };
    }

    const { data: voucher, error: voucherError } = await supabaseAdmin
        .from('ordem_transporte_vouchers')
        .select('*')
        .eq('id', voucherId)
        .eq('ordem_transporte_id', ordemId)
        .maybeSingle();

    if (voucherError) {
        return { data: null, error: voucherError };
    }

    if (!voucher) {
        return {
            data: null,
            error: erro(
                'Voucher não encontrado para esta OT.',
                'VOUCHER_NAO_ENCONTRADO'
            )
        };
    }

    const [
        { data: paciente, error: pacienteError },
        { data: fornecedor, error: fornecedorError }
    ] = await Promise.all([
        supabaseAdmin
            .from('pacientes')
            .select('id, nome')
            .eq('id', ordem.paciente_id)
            .maybeSingle(),
        supabaseAdmin
            .from('fornecedores')
            .select('id, razao_social, nome_fantasia')
            .eq('id', ordem.fornecedor_id)
            .maybeSingle()
    ]);

    if (pacienteError) {
        return { data: null, error: pacienteError };
    }

    if (fornecedorError) {
        return { data: null, error: fornecedorError };
    }

    return {
        data: {
            ...ordem,
            paciente: paciente || { id: ordem.paciente_id },
            fornecedor: fornecedor || { id: ordem.fornecedor_id },
            voucher
        },
        error: null
    };
}

export async function registrarEntregaVoucherTransporte({
    ordemId,
    voucherId,
    entreguePor,
    destinatario
}) {
    if (!ordemId || !voucherId || !entreguePor) {
        return {
            data: null,
            error: erro(
                'Ordem, voucher e usuário responsável são obrigatórios.'
            )
        };
    }

    if (typeof destinatario !== 'string' || !destinatario.trim()) {
        return {
            data: null,
            error: erro(
                'O destinatário é obrigatório.',
                'DESTINATARIO_OBRIGATORIO'
            )
        };
    }

    const { data, error: dbError } = await supabaseAdmin.rpc(
        'registrar_entrega_voucher_transporte',
        {
            p_ordem_id: ordemId,
            p_voucher_id: voucherId,
            p_entregue_por: entreguePor,
            p_destinatario: destinatario.trim()
        }
    );

    if (dbError) {
        const mensagem = dbError.message || '';

        const codigos = [
            'USUARIO_OBRIGATORIO',
            'DESTINATARIO_OBRIGATORIO',
            'OT_NAO_ENCONTRADA',
            'VOUCHER_NAO_ENCONTRADO',
            'OT_NAO_PODE_SER_ENTREGUE',
            'OT_VENCIDA',
            'VOUCHER_JA_ENTREGUE'
        ];

        const codigo = codigos.find(c => mensagem.includes(c));

        return {
            data: null,
            error: erro(
                codigo
                    ? ({
                        USUARIO_OBRIGATORIO: 'O usuário responsável é obrigatório.',
                        DESTINATARIO_OBRIGATORIO: 'O destinatário é obrigatório.',
                        OT_NAO_ENCONTRADA: 'Ordem de Transporte não encontrada.',
                        VOUCHER_NAO_ENCONTRADO: 'Voucher não encontrado para esta OT.',
                        OT_NAO_PODE_SER_ENTREGUE: 'A OT não está em um estado que permita registrar a entrega.',
                        OT_VENCIDA: 'A validade da OT expirou.',
                        VOUCHER_JA_ENTREGUE: 'Este voucher já foi entregue.'
                    })[codigo]
                    : 'Não foi possível registrar a entrega do voucher.',
                codigo || 'ERRO_REGISTRO_ENTREGA'
            )
        };
    }

    return { data, error: null };
}

export async function gerarSegundaViaVoucherTransporte({
    ordemId,
    emitidoPor
}) {
    if (!ordemId || !emitidoPor) {
        return {
            data: null,
            error: erro(
                'Ordem de Transporte e usuário emissor são obrigatórios.',
                'DADOS_OBRIGATORIOS'
            )
        };
    }

    const { data, error: dbError } = await supabaseAdmin.rpc(
        'gerar_segunda_via_voucher_transporte',
        {
            p_ordem_id: ordemId,
            p_emitido_por: emitidoPor
        }
    );

    if (dbError) {
        const mensagem = dbError.message || '';

        const errosConhecidos = {
            OT_NAO_ENCONTRADA: {
                mensagem: 'Ordem de Transporte não encontrada.',
                codigo: 'OT_NAO_ENCONTRADA'
            },
            OT_NAO_PERMITE_SEGUNDA_VIA: {
                mensagem: 'O estado atual da OT não permite emitir segunda via.',
                codigo: 'OT_NAO_PERMITE_SEGUNDA_VIA'
            },
            OT_VENCIDA: {
                mensagem: 'A validade da OT expirou.',
                codigo: 'OT_VENCIDA'
            },
            USUARIO_NAO_ENCONTRADO: {
                mensagem: 'O usuário emissor não foi encontrado.',
                codigo: 'USUARIO_NAO_ENCONTRADO'
            },
            DADOS_OBRIGATORIOS: {
                mensagem: 'Ordem e usuário emissor são obrigatórios.',
                codigo: 'DADOS_OBRIGATORIOS'
            }
        };

        const chave = Object.keys(errosConhecidos)
            .find(codigo => mensagem.includes(codigo));

        if (chave) {
            return {
                data: null,
                error: erro(
                    errosConhecidos[chave].mensagem,
                    errosConhecidos[chave].codigo
                )
            };
        }

        return {
            data: null,
            error: erro(
                'Não foi possível emitir a segunda via do voucher.',
                'ERRO_SEGUNDA_VIA'
            )
        };
    }

    if (!data?.ordem || !data?.voucher) {
        return {
            data: null,
            error: erro(
                'O banco não retornou os dados esperados da segunda via.',
                'RESPOSTA_SEGUNDA_VIA_INVALIDA'
            )
        };
    }

    return {
        data: {
            ...data.ordem,
            voucher: data.voucher
        },
        error: null
    };
}
