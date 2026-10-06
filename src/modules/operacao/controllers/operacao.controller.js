import {
    buscarExecucao,
    AUTOMACAO_JOB,
    listarExecucoes,
    listarPendencias
} from '../services/automacao.service.js'
import { executarJobDeAtraso } from '../../fornecimento/services/atraso.job.js'
import { executarJobDeProximidade } from '../../notificacoes/services/proximidade.job.js'
import { processarLembretesDevidos } from '../../notificacoes/services/lembretes-fornecedor.service.js'

const JOBS = Object.freeze([
    AUTOMACAO_JOB.PROXIMIDADE,
    AUTOMACAO_JOB.ATRASO,
    AUTOMACAO_JOB.LEMBRETES_FORNECEDOR
])

function somenteGestor(req, res) {
    if (req.user?.perfil === 'gestor') return true
    res.status(403).json({ message: 'Apenas gestor pode operar a automacao de prazos' })
    return false
}

function normalizarJobs(body = {}) {
    const solicitados = body.jobs ?? body.tipos ?? (body.job ? [body.job] : JOBS)
    if (!Array.isArray(solicitados)) return null

    const jobs = [...new Set(solicitados)]
    return jobs.length > 0 && jobs.every((job) => JOBS.includes(job)) ? jobs : null
}

async function executarJobManual(jobNome, solicitanteId) {
    const opcoes = {
        origem: 'manual',
        solicitanteId
    }

    if (jobNome === AUTOMACAO_JOB.PROXIMIDADE) {
        return await executarJobDeProximidade(opcoes)
    }

    if (jobNome === AUTOMACAO_JOB.ATRASO) {
        return await executarJobDeAtraso(opcoes)
    }

    return await processarLembretesDevidos(opcoes)
}

export async function processarPrazosManualmente(req, res) {
    if (!somenteGestor(req, res)) return

    const jobs = normalizarJobs(req.body)
    if (!jobs) {
        return res.status(400).json({
            message: 'Informe jobs validos: proximidade, atraso ou lembretes_fornecedor'
        })
    }

    const execucoes = []
    for (const jobNome of jobs) {
        try {
            execucoes.push(await executarJobManual(jobNome, req.user.id))
        } catch (error) {
            execucoes.push({
                jobNome,
                status: 'falha',
                error: error.message
            })
        }
    }

    const falhas = execucoes.filter((execucao) => execucao.status === 'falha').length
    const resumo = execucoes.reduce((acc, execucao) => ({
        ordensExaminadas: acc.ordensExaminadas + Number(execucao.ordensExaminadas ?? execucao.examinadas ?? 0),
        ordensAfetadas: acc.ordensAfetadas + Number(execucao.ordensAfetadas ?? execucao.transicionadas ?? execucao.alertadas ?? execucao.enviados ?? 0),
        notificacoesCriadas: acc.notificacoesCriadas + Number(execucao.notificacoesCriadas ?? execucao.notificacoes ?? 0),
        emailsEnviados: acc.emailsEnviados + Number(execucao.emailsEnviados ?? execucao.enviados ?? 0),
        falhas: acc.falhas + Number(execucao.falhas ?? execucao.erros ?? (execucao.status === 'falha' ? 1 : 0)),
        retentativas: acc.retentativas + Number(execucao.retentativas ?? 0),
        inconsistencias: acc.inconsistencias + Number(execucao.inconsistencias ?? 0)
    }), {
        ordensExaminadas: 0,
        ordensAfetadas: 0,
        notificacoesCriadas: 0,
        emailsEnviados: 0,
        falhas: 0,
        retentativas: 0,
        inconsistencias: 0
    })

    return res.status(falhas === execucoes.length ? 500 : 200).json({
        status: falhas > 0 ? 'concluida_com_falhas' : 'concluida',
        solicitanteId: req.user.id,
        jobs,
        resumo,
        execucoes
    })
}

export async function consultarExecucoes(req, res) {
    if (!somenteGestor(req, res)) return

    const resultado = await listarExecucoes({
        limite: req.query.limit,
        jobNome: req.query.job || null
    })
    if (resultado.error) return res.status(500).json({ message: resultado.error.message })
    return res.json(resultado.data || [])
}

export async function consultarPendencias(req, res) {
    if (!somenteGestor(req, res)) return

    const resultado = await listarPendencias({
        limite: req.query.limit,
        status: req.query.status || 'pendente'
    })
    if (resultado.error) return res.status(500).json({ message: resultado.error.message })
    return res.json(resultado.data || [])
}

export async function consultarExecucao(req, res) {
    if (!somenteGestor(req, res)) return

    const resultado = await buscarExecucao({ id: req.params.id })
    if (resultado.error) return res.status(500).json({ message: resultado.error.message })
    if (!resultado.data) return res.status(404).json({ message: 'Execucao nao encontrada' })
    return res.json(resultado.data)
}
