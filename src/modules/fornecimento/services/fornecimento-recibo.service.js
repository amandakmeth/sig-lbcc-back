
import supabaseAdmin from '../../../config/supabaseAdmin.js'
import { registrarAuditoria } from '../../historico_pacientes/services/auditoria.service.js'
import { createSmtpAdapter } from '../../notificacoes/services/smtp.adapter.js'
import {
    buildReceiptPdf,
    nomeArquivoReciboPdf
} from './ordem-fornecimento-pdf.service.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ORDEM_RECIBO_SELECT = `
    id,
    numero,
    status,
    data_finalizacao,
    fornecedor_id,
    fornecedores:fornecedor_id (
        id,
        razao_social,
        nome_fantasia,
        email
    ),
    ordem_fornecimento_itens (
        id,
        descricao,
        quantidade_solicitada,
        quantidade_entregue,
        unidade,
        valor_total
    )
`

function erro(codigo, mensagem) {
    return { data: null, error: { code: codigo, message: mensagem } }
}

function nomeFornecedor(ordem) {
    return ordem?.fornecedores?.nome_fantasia
        || ordem?.fornecedores?.razao_social
        || 'Fornecedor'
}

async function auditar({ ordemId, usuarioId, acao, dados = {} }) {
    return registrarAuditoria({
        entidade_tipo: 'ordem_fornecimento_recibo',
        entidade_id: ordemId,
        acao,
        usuario_id: usuarioId || null,
        dados
    })
}

export async function enviarReciboFinalizacaoOF({
    ordemId,
    usuarioId = null,
    db = supabaseAdmin,
    adapter = createSmtpAdapter()
}) {
    const resultadoOrdem = await db
        .from('ordens_fornecimento')
        .select(ORDEM_RECIBO_SELECT)
        .eq('id', ordemId)
        .maybeSingle()

    if (resultadoOrdem.error) {
        return { data: null, error: resultadoOrdem.error }
    }

    const ordem = resultadoOrdem.data

    if (!ordem) {
        return erro('OF_NAO_ENCONTRADA', 'Ordem de Fornecimento não encontrada.')
    }

    if (ordem.status !== 'finalizada') {
        return erro(
            'OF_NAO_FINALIZADA',
            'O recibo só pode ser enviado após a finalização da ordem.'
        )
    }

    const email = ordem.fornecedores?.email?.trim()

    if (!email || !EMAIL_PATTERN.test(email)) {
        return erro(
            'EMAIL_FORNECEDOR_INVALIDO',
            'O fornecedor não possui um e-mail válido cadastrado.'
        )
    }

    const pdf = buildReceiptPdf(ordem)
    const nomeArquivo = nomeArquivoReciboPdf(ordem)
    const agora = new Date().toISOString()

    const registroResult = await db
        .from('ordens_fornecimento_recibos')
        .upsert({
            ordem_fornecimento_id: ordem.id,
            status: 'enviando',
            destinatario_email: email,
            nome_arquivo: nomeArquivo,
            pdf_base64: pdf.toString('base64'),
            erro: null,
            atualizado_em: agora,
            solicitado_por: usuarioId || null
        }, {
            onConflict: 'ordem_fornecimento_id'
        })
        .select('*')
        .single()

    if (registroResult.error) {
        return { data: null, error: registroResult.error }
    }

    const recibo = registroResult.data
    let envio;

    // 1. Enviar o e-mail.
    try {
        envio = await adapter.send({
            to: email,
            from: process.env.SMTP_FROM,
            replyTo: process.env.SMTP_REPLY_TO || process.env.SMTP_FROM,
            subject: `Recibo de finalização da Ordem de Fornecimento ${ordem.numero || ordem.id}`,
            text: [
                `Olá, ${nomeFornecedor(ordem)}.`,
                '',
                `Segue em anexo o recibo de finalização da Ordem de Fornecimento ${ordem.numero || ordem.id}.`,
                '',
                'Este e-mail registra a finalização da ordem no sistema.'
            ].join('\n'),
            html: `
                <p>Olá, ${nomeFornecedor(ordem)}.</p>
                <p>
                    Segue em anexo o recibo de finalização da
                    Ordem de Fornecimento
                    <strong>${ordem.numero || ordem.id}</strong>.
                </p>
            `,
            attachments: [{
                filename: nomeArquivo,
                contentType: 'application/pdf',
                content: pdf
            }]
        });
    } catch (exception) {
        const mensagem = exception.message || 'Falha desconhecida no envio.';

        try {
            const falha = await db
                .from('ordens_fornecimento_recibos')
                .update({
                    status: 'falhou',
                    erro: mensagem,
                    tentativas: Number(recibo.tentativas || 0) + 1,
                    atualizado_em: new Date().toISOString()
                })
                .eq('id', recibo.id)
                .select('*')
                .single();

            if (falha.error) {
                console.error(
                    '[RF_F9] Não foi possível registrar a falha:',
                    falha.error.message
                );
            }
        } catch (erroPersistencia) {
            console.error(
                '[RF_F9] Erro ao persistir a falha:',
                erroPersistencia.message
            );
        }

        try {
            await auditar({
                ordemId: ordem.id,
                usuarioId,
                acao: 'OF_RECIBO_FALHOU',
                dados: {
                    recibo_id: recibo.id,
                    destinatario_email: email,
                    erro: mensagem
                }
            });
        } catch (erroAuditoria) {
            console.error(
                '[RF_F9] Falha ao auditar erro de envio:',
                erroAuditoria.message
            );
        }

        return {
            data: {
                ...recibo,
                status: 'falhou',
                erro: mensagem
            },
            error: {
                code: 'FALHA_ENVIO_RECIBO',
                message: mensagem
            }
        };
    }

    // 2. O SMTP confirmou o envio.
    let atualizado;

    try {
        atualizado = await db
            .from('ordens_fornecimento_recibos')
            .update({
                status: 'enviado',
                message_id: envio?.messageId || null,
                enviado_em: new Date().toISOString(),
                atualizado_em: new Date().toISOString(),
                erro: null,
                tentativas: Number(recibo.tentativas || 0) + 1
            })
            .eq('id', recibo.id)
            .select('*')
            .single();
    } catch (exception) {
        console.error(
            '[RF_F9] E-mail enviado, mas houve falha no banco:',
            exception.message
        );

        return {
            data: {
                ...recibo,
                enviado: true,
                message_id: envio?.messageId || null
            },
            error: {
                code: 'PERSISTENCIA_ENVIO_PENDENTE',
                message: 'O e-mail foi enviado, mas o status não pôde ser confirmado no banco.'
            }
        };
    }

    if (atualizado.error) {
        console.error(
            '[RF_F9] E-mail enviado, mas houve falha no banco:',
            atualizado.error.message
        );

        return {
            data: {
                ...recibo,
                enviado: true,
                message_id: envio?.messageId || null
            },
            error: {
                code: 'PERSISTENCIA_ENVIO_PENDENTE',
                message: 'O e-mail foi enviado, mas o status não pôde ser confirmado no banco.'
            }
        };
    }

    // 3. Auditar sem desfazer o envio confirmado.
    try {
        const resultadoAuditoria = await auditar({
            ordemId: ordem.id,
            usuarioId,
            acao: 'OF_RECIBO_ENVIADO',
            dados: {
                recibo_id: recibo.id,
                destinatario_email: email,
                nome_arquivo: nomeArquivo,
                message_id: envio?.messageId || null
            }
        });

        if (resultadoAuditoria?.error) {
            console.error(
                '[RF_F9] Falha ao registrar auditoria:',
                resultadoAuditoria.error.message
            );
        }
    } catch (erroAuditoria) {
        console.error(
            '[RF_F9] Recibo enviado, mas a auditoria falhou:',
            erroAuditoria.message
        );
    }

    return { data: atualizado.data, error: null };
}

export async function reenviarReciboFinalizacaoOF({
    ordemId,
    usuarioId = null,
    db = supabaseAdmin,
    adapter = createSmtpAdapter()
}) {
    const existente = await db
        .from('ordens_fornecimento_recibos')
        .select('id, status')
        .eq('ordem_fornecimento_id', ordemId)
        .maybeSingle()

    if (existente.error) {
        return { data: null, error: existente.error }
    }

    if (!existente.data) {
        return erro(
            'RECIBO_NAO_ENCONTRADO',
            'Ainda não existe recibo registrado para esta ordem.'
        )
    }

   if (existente.data.status === 'enviando') {
    return erro(
        'RECIBO_EM_ENVIO',
        'O recibo já está em processo de envio.'
    )
}

if (existente.data.status !== 'falhou') {
    return erro(
        'RECIBO_NAO_REENVIAVEL',
        'O reenvio só é permitido quando o envio anterior falhou.'
    )
}

    return enviarReciboFinalizacaoOF({
        ordemId,
        usuarioId,
        db,
        adapter
    })
}
