import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildMessages, getModels, normalizeSettings, streamAnswer } from '../src/main/llm'
import { DEFAULT_SETTINGS, type Settings } from '../src/shared/types'

let baseUrl = ''
let received: { headers: Record<string, unknown>; body: Record<string, unknown> } | undefined
let mode: 'stream' | 'json' | 'context' | 'auth' | 'wait' | 'invalid' = 'stream'
let waitingResponse: ServerResponse | undefined
const server = createServer(async (req, res) => {
  if (mode === 'auth') { res.writeHead(401); res.end('secret'); return }
  if (req.url === '/v1/models') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'local-instruct' }] })); return }
  let body = ''
  for await (const part of req) body += part
  received = { headers: req.headers, body: JSON.parse(body) }
  if (mode === 'context') { res.writeHead(400); res.end('context length exceeded'); return }
  if (mode === 'json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: 'Risposta JSON [S1]' } }] })); return }
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  res.flushHeaders()
  if (mode === 'wait') { waitingResponse = res; return }
  if (mode === 'invalid') { res.end('data: not-json\n\n'); return }
  // Deliberately split both UTF-8 characters and SSE lines across network writes.
  const data = Buffer.from('data: {"choices":[{"delta":{"content":"La retta è €800 "}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"[S1]"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')
  for (let offset = 0; offset < data.length; offset += 3) res.write(data.subarray(offset, offset + 3))
  res.end()
})

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
})
afterAll(async () => { waitingResponse?.destroy(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())) })
const settings = (): Settings => ({ ...DEFAULT_SETTINGS, baseUrl, model: 'local-instruct', apiKey: 'test-key' })

describe('API compatibile LM Studio', () => {
  it('normalizza endpoint senza /v1 e rifiuta URL non HTTP', () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, baseUrl: 'http://localhost:1234/' }).baseUrl).toBe('http://localhost:1234/v1')
    expect(() => normalizeSettings({ ...DEFAULT_SETTINGS, baseUrl: 'file:///etc/passwd' })).toThrow()
  })

  it('legge l’elenco modelli', async () => {
    mode = 'stream'
    expect(await getModels(settings())).toEqual(['local-instruct'])
  })

  it('invia modello e autenticazione e ricompone lo streaming UTF-8', async () => {
    mode = 'stream'
    let output = ''
    await streamAnswer(settings(), [{ role: 'user', content: 'Quanto costa?' }], new AbortController().signal, (text) => { output += text })
    expect(output).toBe('La retta è €800 [S1]')
    expect(received?.headers.authorization).toBe('Bearer test-key')
    expect(received?.body.model).toBe('local-instruct')
    expect(received?.body.stream).toBe(true)
  })

  it('accetta anche una risposta JSON non streaming', async () => {
    mode = 'json'
    let output = ''
    await streamAnswer(settings(), [], new AbortController().signal, (text) => { output += text })
    expect(output).toBe('Risposta JSON [S1]')
  })

  it('traduce errori di autenticazione e contesto senza esporre dati del server', async () => {
    mode = 'auth'
    await expect(getModels(settings())).rejects.toThrow('Accesso al server negato')
    mode = 'context'
    await expect(streamAnswer(settings(), [], new AbortController().signal, () => {})).rejects.toThrow('contesto supera')
  })

  it('segnala dati streaming malformati', async () => {
    mode = 'invalid'
    await expect(streamAnswer(settings(), [], new AbortController().signal, () => {})).rejects.toThrow('flusso di risposta non valido')
  })

  it('interrompe una richiesta in attesa su annullamento', async () => {
    mode = 'wait'
    const controller = new AbortController()
    const answer = streamAnswer(settings(), [], controller.signal, () => {})
    const assertion = expect(answer).rejects.toMatchObject({ name: 'AbortError' })
    setTimeout(() => controller.abort(), 70)
    await assertion
    waitingResponse?.destroy()
  })

  it('inserisce nel prompt fonti, data e distinzione dai dati personali', () => {
    const messages = buildMessages('Quanto costa?', [], [{ id: 'S1', title: 'Tariffe', text: '€800', startLine: 1, endLine: 2 }], '15 ottobre 2026')
    expect(messages[0].content).toContain('<fonte id="S1">')
    expect(messages[0].content).toContain('15 ottobre 2026')
    expect(messages[0].content).toContain('Non hai accesso a posizioni personali')
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Quanto costa?' })
  })

  it('mantiene coppie complete e alternate dopo richieste fallite o cronologie lunghe', () => {
    const messages = buildMessages('Nuova domanda', [
      { role: 'assistant', content: 'Risposta senza domanda, da scartare' },
      { role: 'user', content: 'Richiesta fallita' },
      { role: 'user', content: 'Domanda valida' },
      { role: 'assistant', content: 'Risposta valida' },
      { role: 'user', content: 'Richiesta annullata' }
    ], [], '15 ottobre 2026')
    expect(messages.slice(1).map((message) => message.role)).toEqual(['user', 'assistant', 'user'])
    expect(messages[1].content).toBe('Domanda valida')
    expect(buildMessages('Nuova', [{ role: 'user', content: 'x'.repeat(7000) }, { role: 'assistant', content: 'breve' }], [], '').length).toBe(2)
  })
})
