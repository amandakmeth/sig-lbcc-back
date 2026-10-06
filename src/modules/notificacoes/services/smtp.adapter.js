import net from 'node:net'
import tls from 'node:tls'

export class SmtpDeliveryError extends Error {
    constructor(message, { statusCode = null, code = null, cause = null } = {}) {
        super(message)
        this.name = 'SmtpDeliveryError'
        this.statusCode = statusCode
        this.code = code
        this.cause = cause
    }
}

function asBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback
    return ['1', 'true', 'yes', 'sim'].includes(String(value).toLowerCase())
}

function requiredHeaderValue(value, name) {
    const normalized = String(value || '').trim()
    if (!normalized || /[\r\n]/.test(normalized)) {
        throw new SmtpDeliveryError(`Cabecalho SMTP invalido: ${name}`, {
            code: 'SMTP_INVALID_HEADER'
        })
    }
    return normalized
}

function parseAddress(value) {
    const normalized = requiredHeaderValue(value, 'from')
    const match = normalized.match(/<([^<>]+)>/)
    return (match ? match[1] : normalized).trim()
}

function smtpErrorFromResponse(response, command) {
    const statusCode = Number(response.slice(0, 3)) || null
    const retryable = statusCode !== null && statusCode >= 400 && statusCode < 500
    return new SmtpDeliveryError(
        `SMTP recusou ${command}: ${response.trim()}`,
        {
            statusCode,
            code: retryable ? 'SMTP_TEMPORARY_FAILURE' : 'SMTP_PERMANENT_FAILURE'
        }
    )
}

function readResponse(socket) {
    return new Promise((resolve, reject) => {
        let buffer = ''
        const responses = []
        let settled = false

        const cleanup = () => {
            socket.off('data', onData)
            socket.off('error', onError)
            socket.off('close', onClose)
        }

        const finish = (callback, value) => {
            if (settled) return
            settled = true
            cleanup()
            callback(value)
        }

        const onData = (chunk) => {
            buffer += chunk.toString()
            const lines = buffer.split(/\r?\n/)
            buffer = lines.pop() || ''

            for (const line of lines) {
                if (/^\d{3}(?:-| )/.test(line)) responses.push(line)
                if (/^\d{3} /.test(line)) {
                    finish(resolve, responses.join('\n'))
                    return
                }
            }
        }

        const onError = (error) => finish(reject, error)
        const onClose = () => finish(reject, new SmtpDeliveryError('Conexao SMTP encerrada'))

        socket.on('data', onData)
        socket.once('error', onError)
        socket.once('close', onClose)
    })
}

function connectSocket({ host, port, secure, timeoutMs }) {
    return new Promise((resolve, reject) => {
        const socket = secure
            ? tls.connect({ host, port, servername: host })
            : net.connect({ host, port })

        let settled = false
        const cleanup = () => {
            socket.off('connect', onConnect)
            socket.off('secureConnect', onConnect)
            socket.off('error', onError)
            socket.off('timeout', onTimeout)
        }
        const finish = (callback, value) => {
            if (settled) return
            settled = true
            cleanup()
            callback(value)
        }
        const onConnect = () => finish(resolve, socket)
        const onError = (error) => finish(reject, new SmtpDeliveryError(`Falha ao conectar no SMTP: ${error.message}`, { cause: error }))
        const onTimeout = () => finish(reject, new SmtpDeliveryError('Tempo limite ao conectar no SMTP', { code: 'SMTP_TIMEOUT' }))

        socket.setTimeout(timeoutMs)
        socket.once('connect', onConnect)
        socket.once('secureConnect', onConnect)
        socket.once('error', onError)
        socket.once('timeout', onTimeout)
    })
}

function normalizeSmtpConfig(config = {}) {
    const host = config.host ?? process.env.SMTP_HOST
    if (!host) {
        throw new SmtpDeliveryError('SMTP_HOST nao configurado', { code: 'SMTP_NOT_CONFIGURED' })
    }

    const secure = config.secure ?? asBoolean(process.env.SMTP_SECURE, false)
    const port = Number(config.port ?? process.env.SMTP_PORT ?? (secure ? 465 : 587))

    return {
        host,
        port: Number.isFinite(port) ? port : (secure ? 465 : 587),
        secure,
        startTls: config.startTls ?? asBoolean(process.env.SMTP_STARTTLS, true),
        user: config.user ?? process.env.SMTP_USER ?? '',
        password: config.password ?? process.env.SMTP_PASSWORD ?? '',
        from: config.from ?? process.env.SMTP_FROM,
        replyTo: config.replyTo ?? process.env.SMTP_REPLY_TO ?? null,
        timeoutMs: Number(config.timeoutMs ?? process.env.SMTP_TIMEOUT_MS ?? 15000)
    }
}

function base64Lines(value) {
    const encoded = Buffer.from(value).toString('base64')
    return encoded.match(/.{1,76}/g)?.join('\r\n') || ''
}

export function formatMessage({ from, to, subject, text, html, replyTo, attachments = [] }) {
    const safeTo = requiredHeaderValue(to, 'to')
    const safeSubject = requiredHeaderValue(subject, 'subject')
    const safeFrom = requiredHeaderValue(from, 'from')
    const plainText = String(text || '').replace(/[\r\n]+$/, '')
    const alternative = html
        ? [
            'Content-Type: multipart/alternative; boundary="sig-lbcc-alternative"',
            '',
            '--sig-lbcc-alternative',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            '',
            plainText,
            '--sig-lbcc-alternative',
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            '',
            String(html),
            '--sig-lbcc-alternative--'
        ].join('\r\n')
        : [
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            '',
            plainText
        ].join('\r\n')

    const body = attachments.length === 0
        ? alternative
        : [
            'Content-Type: multipart/mixed; boundary="sig-lbcc-mixed"',
            '',
            '--sig-lbcc-mixed',
            alternative,
            ...attachments.flatMap((attachment) => [
                '--sig-lbcc-mixed',
                `Content-Type: ${requiredHeaderValue(attachment.contentType || 'application/octet-stream', 'attachment content type')}; name="${requiredHeaderValue(attachment.filename || 'anexo', 'attachment filename')}"`,
                'Content-Transfer-Encoding: base64',
                `Content-Disposition: attachment; filename="${requiredHeaderValue(attachment.filename || 'anexo', 'attachment filename')}"`,
                '',
                base64Lines(attachment.content)
            ]),
            '--sig-lbcc-mixed--'
        ].join('\r\n')

    return [
        `From: ${safeFrom}`,
        `To: ${safeTo}`,
        `Subject: ${safeSubject}`,
        ...(replyTo ? [`Reply-To: ${requiredHeaderValue(replyTo, 'reply-to')}`] : []),
        'MIME-Version: 1.0',
        body,
        ''
    ].join('\r\n').replace(/^\./gm, '..')
}

export function createSmtpAdapter(config = {}) {
    return {
        async send({ to, from, subject, text, html, replyTo, attachments }) {
            const smtp = normalizeSmtpConfig({ ...config, from: from ?? config.from })
            const envelopeFrom = parseAddress(smtp.from)
            let connection = await connectSocket(smtp)

            const command = async (value, name = value.split(' ')[0]) => {
                connection.write(`${value}\r\n`)
                const response = await readResponse(connection)
                if (!/^[23]\d\d(?:-| )/.test(response)) throw smtpErrorFromResponse(response, name)
                return response
            }

            try {
                await readResponse(connection)
                let ehlo = await command(`EHLO ${process.env.SMTP_HELO || 'sig-lbcc'}`, 'EHLO')
                const supportsStartTls = /(^|\n)250[- ]STARTTLS/i.test(ehlo)

                if (!smtp.secure && smtp.startTls && supportsStartTls) {
                    await command('STARTTLS')
                    const secureSocket = tls.connect({ socket: connection, servername: smtp.host })
                    await new Promise((resolve, reject) => {
                        secureSocket.once('secureConnect', resolve)
                        secureSocket.once('error', reject)
                    })
                    connection = secureSocket
                    ehlo = await command(`EHLO ${process.env.SMTP_HELO || 'sig-lbcc'}`, 'EHLO')
                }

                if (smtp.user || smtp.password) {
                    const credentials = Buffer.from(`\0${smtp.user}\0${smtp.password}`).toString('base64')
                    await command(`AUTH PLAIN ${credentials}`, 'AUTH')
                }

                await command(`MAIL FROM:<${envelopeFrom}>`, 'MAIL FROM')
                await command(`RCPT TO:<${requiredHeaderValue(to, 'to')}>`, 'RCPT TO')
                await command('DATA')
                connection.write(`${formatMessage({ from: smtp.from, to, subject, text, html, replyTo: replyTo ?? smtp.replyTo, attachments })}\r\n.\r\n`)
                const delivered = await readResponse(connection)
                if (!/^250 /.test(delivered)) throw smtpErrorFromResponse(delivered, 'DATA')
                await command('QUIT', 'QUIT').catch(() => null)

                return {
                    messageId: delivered.slice(4).trim() || null,
                    provider: 'smtp'
                }
            } catch (error) {
                connection.destroy()
                if (error instanceof SmtpDeliveryError) throw error
                throw new SmtpDeliveryError(`Falha no envio SMTP: ${error.message}`, { cause: error })
            } finally {
                if (!connection.destroyed) connection.end()
            }
        }
    }
}
