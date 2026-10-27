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

export async function criarOrdemDeTransportePendente({
    cotacaoId,
    criadoPor = null
}) {
    if (!cotacaoId) {
        return {
            data: null,
            error: erro(
                'O ID da cotação é obrigatório.',
                'COTACAO_OBRIGATORIA'
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
        .select('*')
        .eq('cotacao_id', cotacaoId)
        .maybeSingle();

    if (existenteError) {
        return { data: null, error: existenteError };
    }

    // Operação idempotente: não cria uma segunda OT para a mesma cotação.
    if (existente) {
        return {
            data: existente,
            error: null,
            existente: true
        };
    }

    const { data: ordem, error: ordemError } = await supabaseAdmin
        .from('ordens_transporte')
        .insert({
            numero: numeroOrdem(),
            cotacao_id: cotacaoId,
            paciente_id: contexto.cotacao.paciente_id,
            fornecedor_id: contexto.fornecedor.id,
            veiculo_placa: null,
            tipo_combustivel: null,
            quantidade_autorizada: null,
            posto_abastecimento: null,
            validade_ate: null,
            observacoes: null,
            status: 'pendente',
            created_by: criadoPor
        })
        .select('*')
        .single();

    if (ordemError) {
        // Proteção para duas tentativas simultâneas.
        if (ordemError.code === '23505') {
            const { data: ordemExistente, error: buscaError } =
                await supabaseAdmin
                    .from('ordens_transporte')
                    .select('*')
                    .eq('cotacao_id', cotacaoId)
                    .maybeSingle();

            if (buscaError) {
                return { data: null, error: buscaError };
            }

            if (ordemExistente) {
                return {
                    data: ordemExistente,
                    error: null,
                    existente: true
                };
            }
        }

        return { data: null, error: ordemError };
    }

    return {
        data: ordem,
        error: null,
        existente: false
    };
}
export async function listarOrdensDeTransporte() {
    const { data, error } = await supabaseAdmin
        .from('ordens_transporte')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        return { data: null, error };
    }

    return { data: data || [], error: null };
}

export async function buscarOrdemDeTransporte(id) {
    if (!id) {
        return {
            data: null,
            error: erro('O ID da Ordem de Transporte é obrigatório.')
        };
    }

    const { data: ordem, error } = await supabaseAdmin
        .from('ordens_transporte')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error) {
        return { data: null, error };
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

    const [
        { data: cotacao, error: cotacaoError },
        { data: paciente, error: pacienteError },
        { data: fornecedor, error: fornecedorError }
    ] = await Promise.all([
        supabaseAdmin
            .from('cotacoes')
            .select('*')
            .eq('id', ordem.cotacao_id)
            .maybeSingle(),
        supabaseAdmin
            .from('pacientes')
            .select('*')
            .eq('id', ordem.paciente_id)
            .maybeSingle(),
        supabaseAdmin
            .from('fornecedores')
            .select('*')
            .eq('id', ordem.fornecedor_id)
            .maybeSingle()
    ]);

    const relacionamentoError =
        cotacaoError || pacienteError || fornecedorError;

    if (relacionamentoError) {
        return { data: null, error: relacionamentoError };
    }

    return {
        data: {
            ...ordem,
            cotacao,
            paciente,
            fornecedor
        },
        error: null
    };
}

export async function atualizarOrdemDeTransporte({
    id,
    veiculoPlaca,
    tipoCombustivel,
    quantidadeAutorizada,
    postoAbastecimento,
    validadeAte,
    observacoes
}) {
    if (!id) {
        return {
            data: null,
            error: erro('O ID da Ordem de Transporte é obrigatório.')
        };
    }

    const { data: atual, error: buscaError } = await supabaseAdmin
        .from('ordens_transporte')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (buscaError) {
        return { data: null, error: buscaError };
    }

    if (!atual) {
        return {
            data: null,
            error: erro(
                'Ordem de Transporte não encontrada.',
                'OT_NAO_ENCONTRADA'
            )
        };
    }

    if (atual.status !== 'pendente') {
        return {
            data: null,
            error: erro(
                'Somente Ordens de Transporte pendentes podem ser editadas.',
                'OT_NAO_PENDENTE'
            )
        };
    }

    const campos = {
        veiculo_placa: veiculoPlaca,
        tipo_combustivel: tipoCombustivel,
        quantidade_autorizada: quantidadeAutorizada,
        posto_abastecimento: postoAbastecimento,
        validade_ate: validadeAte,
        observacoes
    };

    const atualizacao = {};

    for (const [campo, valor] of Object.entries(campos)) {
        if (valor !== undefined) {
            atualizacao[campo] = valor === '' ? null : valor;
        }
    }

    if (Object.keys(atualizacao).length === 0) {
        return {
            data: null,
            error: erro('Informe pelo menos um campo para atualizar.')
        };
    }

    if (
        atualizacao.quantidade_autorizada !== undefined &&
        atualizacao.quantidade_autorizada !== null
    ) {
        const quantidade = Number(atualizacao.quantidade_autorizada);

        if (!Number.isFinite(quantidade) || quantidade <= 0) {
            return {
                data: null,
                error: erro(
                    'A quantidade autorizada precisa ser um número positivo.'
                )
            };
        }

        atualizacao.quantidade_autorizada = quantidade;
    }

    if (
        atualizacao.validade_ate !== undefined &&
        atualizacao.validade_ate !== null &&
        (
            !dataISOValida(atualizacao.validade_ate) ||
            atualizacao.validade_ate < hojeISO()
        )
    ) {
        return {
            data: null,
            error: erro(
                'A validade precisa ser uma data válida igual ou posterior à data atual.'
            )
        };
    }

    for (const campo of [
        'veiculo_placa',
        'tipo_combustivel',
        'posto_abastecimento',
        'observacoes'
    ]) {
        if (typeof atualizacao[campo] === 'string') {
            atualizacao[campo] = atualizacao[campo].trim() || null;
        }
    }

    atualizacao.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
        .from('ordens_transporte')
        .update(atualizacao)
        .eq('id', id)
        .eq('status', 'pendente')
        .select('*')
        .maybeSingle();

    if (error) {
        return { data: null, error };
    }

    if (!data) {
        return {
            data: null,
            error: erro(
                'A OT deixou de estar pendente e não pôde ser atualizada.',
                'OT_NAO_PENDENTE'
            )
        };
    }

    return { data, error: null };
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
            error: erro(
                'Cotação e usuário emissor são obrigatórios.',
                'DADOS_OBRIGATORIOS'
            )
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
        .select('*')
        .eq('cotacao_id', cotacaoId)
        .maybeSingle();

    if (existenteError) {
        return { data: null, error: existenteError };
    }

    if (existente && existente.status !== 'pendente') {
        return {
            data: null,
            error: erro(
                `Já existe uma OT para esta cotação (${existente.numero}) e ela não está pendente.`,
                'OT_JA_EXISTE'
            )
        };
    }

    const camposEmissao = {
        veiculo_placa: veiculoPlaca?.trim() || null,
        tipo_combustivel: tipoCombustivel.trim(),
        quantidade_autorizada: quantidade,
        posto_abastecimento: postoAbastecimento.trim(),
        validade_ate: validadeAte,
        observacoes: observacoes?.trim() || null,
        fornecedor_id: contexto.fornecedor.id,
        paciente_id: contexto.cotacao.paciente_id,
        updated_at: new Date().toISOString()
    };

    let ordem;
    let ordemCriadaAgora = false;

    if (existente) {
        // Reaproveita a OT criada automaticamente após a escolha do vencedor.
        const { data, error: atualizacaoError } = await supabaseAdmin
            .from('ordens_transporte')
            .update({
                ...camposEmissao,
                status: 'emitida'
            })
            .eq('id', existente.id)
            .eq('status', 'pendente')
            .select('*')
            .maybeSingle();

        if (atualizacaoError) {
            return { data: null, error: atualizacaoError };
        }

        if (!data) {
            return {
                data: null,
                error: erro(
                    'A OT deixou de estar pendente. Atualize a consulta antes de tentar emitir novamente.',
                    'OT_NAO_PENDENTE'
                )
            };
        }

        ordem = data;
    } else {
        // Compatibilidade com emissão manual quando ainda não existe OT.
        const { data, error: criacaoError } = await supabaseAdmin
            .from('ordens_transporte')
            .insert({
                numero: numeroOrdem(),
                cotacao_id: cotacaoId,
                ...camposEmissao,
                status: 'emitida',
                created_by: emitidoPor
            })
            .select('*')
            .single();

        if (criacaoError) {
            if (criacaoError.code === '23505') {
                return {
                    data: null,
                    error: erro(
                        'Já existe uma OT para esta cotação. Consulte a ordem antes de tentar novamente.',
                        'OT_JA_EXISTE'
                    )
                };
            }

            return { data: null, error: criacaoError };
        }

        ordem = data;
        ordemCriadaAgora = true;
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
        // Se a OT já existia, devolve-a ao estado pendente.
        // Se foi criada nesta chamada, mantém o comportamento de cancelamento.
        let erroReversao = null;

        if (ordemCriadaAgora) {
            const { error: reversaoError } = await supabaseAdmin
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

            erroReversao = reversaoError;
        } else {
            const { error: reversaoError } = await supabaseAdmin
                .from('ordens_transporte')
                .update({
                    status: 'pendente',
                    updated_at: new Date().toISOString()
                })
                .eq('id', ordem.id)
                .eq('status', 'emitida');

            erroReversao = reversaoError;
        }

        return {
            data: null,
            error: {
                ...erro(
                    erroReversao
                        ? 'Falha ao criar o voucher e ao reverter o estado da OT. Verifique o registro antes de tentar novamente.'
                        : 'Não foi possível registrar o voucher original. A OT foi mantida pendente ou cancelada, conforme sua origem.',
                    'FALHA_AO_CRIAR_VOUCHER'
                ),
                detalhes: voucherError.message,
                erroReversao: erroReversao?.message || null,
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

export async function listarVouchersTransporte(ordemId) {
    if (!ordemId) {
        return {
            data: null,
            error: erro(
                'O ID da Ordem de Transporte é obrigatório.',
                'DADOS_OBRIGATORIOS'
            )
        };
    }

    const { data: ordem, error: ordemError } = await supabaseAdmin
        .from('ordens_transporte')
        .select('id')
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

    const { data: vouchers, error: vouchersError } = await supabaseAdmin
        .from('ordem_transporte_vouchers')
        .select('*')
        .eq('ordem_transporte_id', ordemId)
        .order('numero_via', { ascending: true });

    if (vouchersError) {
        return { data: null, error: vouchersError };
    }

    return {
        data: vouchers ?? [],
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
