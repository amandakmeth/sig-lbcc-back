import supabaseAdmin from '../../../config/supabaseAdmin.js'
import { createSmtpAdapter } from '../../notificacoes/services/smtp.adapter.js'

import {
    criarNotificacaoInterna,
    NOTIFICACAO_TIPO
} from '../../notificacoes/services/notificacoes.service.js'

import { listarGestoresResponsaveis } from './fornecimento.services.js'

export async function listarSolicitacoesCancelamentoDireto() {
    const { data, error } = await supabaseAdmin
        .from('solicitacoes_cancelamento_ordem')
        .select('*')
        .is('divergencia_id', null)
        .order('solicitado_em', { ascending: false })
        .limit(200)

    if (error) {
        throw new Error('Não foi possível listar as solicitações diretas de cancelamento.')
    }

    const solicitacoes = data || []

    const ordensFornecimentoIds = solicitacoes
        .map(item => item.ordem_fornecimento_id)
        .filter(Boolean)

    const { data: ordens, error: ordensError } = ordensFornecimentoIds.length
        ? await supabaseAdmin
            .from('ordens_fornecimento')
            .select('id, cotacao_id')
            .in('id', ordensFornecimentoIds)
        : { data: [], error: null }

    if (ordensError) throw ordensError

    const cotacaoIds = [...new Set(
        (ordens || []).map(ordem => ordem.cotacao_id).filter(Boolean)
    )]

    const { data: cotacoes, error: cotacoesError } = cotacaoIds.length
        ? await supabaseAdmin
            .from('cotacoes')
            .select('id, data_validade')
            .in('id', cotacaoIds)
        : { data: [], error: null }

    if (cotacoesError) throw cotacoesError

    const validadePorCotacao = new Map(
        (cotacoes || []).map(cotacao => [cotacao.id, cotacao.data_validade])
    )

    const cotacaoPorOrdem = new Map(
        (ordens || []).map(ordem => [ordem.id, ordem.cotacao_id])
    )

    return solicitacoes.map(item => {
        const cotacaoId = cotacaoPorOrdem.get(item.ordem_fornecimento_id)

        return {
            ...item,
            data_validade_cotacao_original: cotacaoId
                ? validadePorCotacao.get(cotacaoId) || null
                : null
        }
    })
}

export async function notificarGestoresCancelamento({
    solicitacaoId,
    ordemId,
    tipoOrdem,
    motivo,
    solicitadoPor,
    ordemFornecimentoId = null
}) {
    const { data: gestores, error } = await listarGestoresResponsaveis()

    if (error) throw error

    const resultados = await Promise.all(
        (gestores || []).map(gestor =>
            criarNotificacaoInterna({
                destinatarioId: gestor.id,
                tipo: NOTIFICACAO_TIPO.CANCELAMENTO_ORDEM_SOLICITADO,
                titulo: 'Solicitação de cancelamento de ordem',
                mensagem: `Foi solicitada a ${tipoOrdem} da ordem ${ordemId}. Motivo: ${motivo}`,
                ordemFornecimentoId,
                dados: {
                    solicitacao_id: solicitacaoId,
                    ordem_id: ordemId,
                    tipo_ordem: tipoOrdem,
                    motivo,
                    solicitado_por: solicitadoPor
                },
                idempotencyKey: `cancelamento:${solicitacaoId}:gestor:${gestor.id}`
            })
        )
    )

    const falhas = resultados.filter(resultado => resultado.error)

    if (falhas.length) {
        throw new Error('Não foi possível registrar todas as notificações dos gestores.')
    }

    return { notificacoesEnviadas: resultados.length }
}


export async function solicitarCancelamentoOrdem({
    ordemFornecimentoId = null,
    ordemTransporteId = null,
    motivo,
    necessidadePaciente,
    usuarioId
}) {
    const { data, error } = await supabaseAdmin.rpc(
        'solicitar_cancelamento_ordem_rf14',
        {
            p_ordem_fornecimento_id: ordemFornecimentoId,
            p_ordem_transporte_id: ordemTransporteId,
            p_motivo: motivo,
            p_necessidade_paciente: necessidadePaciente,
            p_usuario_id: usuarioId
        }
    )

    if (error) throw error
    if (!data?.ok) {
        throw new Error(data?.message || 'Não foi possível solicitar o cancelamento.')
    }

    const solicitacao = data?.solicitacao ?? data
    const solicitacaoId = solicitacao?.id ?? data?.id
    const tipoOrdem = ordemFornecimentoId ? 'cancelamento da OF' : 'cancelamento da OT'
    const ordemId = ordemFornecimentoId ?? ordemTransporteId

    let notificacao = { notificacoesEnviadas: 0, erro: null }

    try {
        notificacao = await notificarGestoresCancelamento({
            solicitacaoId,
            ordemId,
            tipoOrdem,
            motivo,
            solicitadoPor: usuarioId,
            ordemFornecimentoId
        })
    } catch (err) {
        notificacao.erro = err.message
    }

    return { solicitacao: data, notificacao }
}



async function notificarFornecedorCancelamento({
    ordemFornecimentoId,
    ordemTransporteId,
    solicitacaoId,
    justificativa
}) {
    let ordem
    let fornecedor

    if (ordemFornecimentoId) {
        const { data, error } = await supabaseAdmin
            .from('ordens_fornecimento')
            .select('id, numero, fornecedores:fornecedor_id(razao_social, nome_fantasia, email)')
            .eq('id', ordemFornecimentoId)
            .single()

        if (error) throw error
        ordem = data
        fornecedor = data.fornecedores
    } else {
        const { data, error } = await supabaseAdmin
            .from('ordens_transporte')
            .select('id, numero, fornecedor_id')
            .eq('id', ordemTransporteId)
            .single()

        if (error) throw error

        ordem = data

        const { data: fornecedorData, error: fornecedorError } = await supabaseAdmin
            .from('fornecedores')
            .select('razao_social, nome_fantasia, email')
            .eq('id', ordem.fornecedor_id)
            .single()

        if (fornecedorError) throw fornecedorError
        fornecedor = fornecedorData
    }

    if (!fornecedor?.email) {
        throw new Error('Fornecedor sem e-mail cadastrado.')
    }

    const nomeFornecedor =
        fornecedor.nome_fantasia || fornecedor.razao_social || 'Fornecedor'

    const tipoOrdem = ordemFornecimentoId
        ? 'Ordem de Fornecimento'
        : 'Ordem de Transporte'

    const adapter = createSmtpAdapter()

    await adapter.send({
        to: fornecedor.email,
        subject: `Cancelamento da ${tipoOrdem} ${ordem.numero}`,
        text: [
            `Olá, ${nomeFornecedor}.`,
            '',
            `Informamos que a ${tipoOrdem} ${ordem.numero} foi cancelada.`,
            `Justificativa: ${justificativa}`,
            '',
            'Esta mensagem é uma notificação automática.'
        ].join('\\n'),
        html: `
            <p>Olá, ${nomeFornecedor}.</p>
            <p>Informamos que a <strong>${tipoOrdem} ${ordem.numero}</strong> foi cancelada.</p>
            <p><strong>Justificativa:</strong> ${justificativa}</p>
            <p>Esta mensagem é uma notificação automática.</p>
        `
    })

    return { enviada: true, destinatario: fornecedor.email }
}




export async function decidirCancelamentoOrdem({
    solicitacaoId,
    aprovado,
    justificativa,
    gerarRecotacao = false,
    dataValidadeRecotacao = null,
    usuarioId
}) {
    const { data, error } = await supabaseAdmin.rpc(
        'decidir_cancelamento_ordem_rf14',
        {
            p_solicitacao_id: solicitacaoId,
            p_aprovado: aprovado,
            p_justificativa: justificativa,
            p_gerar_recotacao: gerarRecotacao,
            p_data_validade_recotacao: dataValidadeRecotacao,
            p_usuario_id: usuarioId
        }
    )

    if (error) throw error

    if (!data?.ok) {
        throw new Error(data?.message || 'A decisão não foi concluída.')
    }
    if (data.recotacao_id) {
        const { error: vinculoError } = await supabaseAdmin
            .from('solicitacoes_cancelamento_ordem')
            .update({ recotacao_id: data.recotacao_id })
            .eq('id', solicitacaoId)

        if (vinculoError) {
            throw new Error('Cancelamento aprovado, mas não foi possível vincular a recotação.')
        }
    }

    const solicitacao = data.solicitacao
    const tipoDecisao = aprovado ? 'aprovado' : 'recusado'
    const tipoOrdem = solicitacao.ordem_fornecimento_id
        ? 'Ordem de Fornecimento'
        : 'Ordem de Transporte'
    const ordemId = solicitacao.ordem_fornecimento_id
        || solicitacao.ordem_transporte_id

    const { error: notificacaoError } = await criarNotificacaoInterna({
        destinatarioId: solicitacao.solicitado_por,
        tipo: 'CANCELAMENTO_ORDEM_DECIDIDO',
        titulo: `Cancelamento ${tipoDecisao}`,
        mensagem: `A solicitação de cancelamento da ${tipoOrdem} ${ordemId} foi ${tipoDecisao}. Justificativa: ${justificativa}`,
        ordemFornecimentoId: solicitacao.ordem_fornecimento_id,
        dados: {
            solicitacao_id: solicitacaoId,
            ordem_id: ordemId,
            tipo_ordem: tipoOrdem,
            aprovado,
            justificativa,
            decidido_por: usuarioId,
            recotacao_id: data.recotacao_id || null
        },
        idempotencyKey: `cancelamento:${solicitacaoId}:operador:decisao`
    })

    if (notificacaoError) {
        console.error('Erro ao notificar operador sobre decisão:', notificacaoError)
    }

    let notificacaoFornecedor = {
        enviada: false,
        erro: null
    }

    if (aprovado) {
        try {
            notificacaoFornecedor = await notificarFornecedorCancelamento({
                ordemFornecimentoId: solicitacao.ordem_fornecimento_id,
                ordemTransporteId: solicitacao.ordem_transporte_id,
                solicitacaoId,
                justificativa
            })
        } catch (err) {
            notificacaoFornecedor.erro = err.message
        }
    }

    return {
        ...data,
        notificacaoFornecedor
    }
}
listarSolicitacoesCancelamentoDireto
