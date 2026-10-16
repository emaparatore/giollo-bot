import { _electron as electron } from 'playwright-core'
import { createServer } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// Uses Electron's own Chromium; no separate browser installation is needed.
const require = createRequire(import.meta.url)
let mode = 'answer'
let lastRequest
let aborted = false
const server = createServer(async (req, res) => {
  if (req.url === '/v1/models') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ data: [{ id: 'test-local-instruct' }] }))
    return
  }
  let body = ''
  for await (const part of req) body += part
  lastRequest = JSON.parse(body)
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  if (mode === 'wait') {
    res.write('data: {"choices":[{"delta":{"content":"Risposta in corso…"}}]}\n\n')
    req.on('close', () => { aborted = true })
    res.on('close', () => { aborted = true })
    return
  }
  const match = /<fonte id="(S\d+)">\nTitolo: [^\n]*9\.2/.exec(lastRequest.messages[0].content)
  const citation = match?.[1] ?? 'S1'
  const text = `Un anno di pianoforte da 30 minuti costa **€860**: €800 di retta e €60 di iscrizione. [${citation}]`
  res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`)
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const dataDir = await mkdtemp(join(tmpdir(), 'opencode', 'armonia-desktop-'))
let app
const errors = []
try {
  const env = { ...process.env, ARMONIA_TEST_USER_DATA: dataDir }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ executablePath: require('electron'), args: [resolve('out/main/index.js')], env })
  const page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('heading', { name: 'La musica inizia con una domanda.' }).waitFor()
  await page.getByRole('button', { name: 'Impostazioni', exact: true }).click()
  await page.getByLabel('Indirizzo del server').fill(`http://127.0.0.1:${port}`)
  await page.getByLabel('Chiave API').fill('desktop-secret')
  await page.getByRole('button', { name: 'Verifica connessione', exact: true }).click()
  await page.getByText('Server raggiungibile · 1 modello disponibile').waitFor()
  await page.getByRole('button', { name: 'Salva impostazioni' }).click()
  await page.getByRole('button', { name: 'LM Studio collegato' }).waitFor()
  const stored = await readFile(join(dataDir, 'settings.json'), 'utf8')
  assert(!stored.includes('desktop-secret'), 'La chiave non deve essere salvata in chiaro')
  assert(JSON.parse(stored).encryptedKey, 'Chiave cifrata assente')

  await page.getByRole('button', { name: /Costi e iscrizioni/ }).click()
  await page.getByRole('button', { name: 'Copia risposta' }).waitFor()
  assert((await page.locator('.answer-content').innerText()).includes('€860'))
  assert.equal(lastRequest.model, 'test-local-instruct')
  assert(lastRequest.messages[0].content.includes('DOCUMENTALI'))
  await page.locator('.inline-citation').first().click()
  await page.getByRole('dialog', { name: 'Dentro la documentazione' }).waitFor()
  assert((await page.locator('.source-dialog-body').innerText()).includes('IND-30'))
  await page.keyboard.press('Escape')

  mode = 'wait'
  await page.getByRole('textbox', { name: 'La tua domanda' }).fill('E il canto?')
  await page.getByRole('button', { name: 'Invia domanda' }).click()
  await page.getByText('Risposta in corso…', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Interrompi risposta' }).click()
  await page.getByText('Generazione interrotta. Il testo potrebbe essere incompleto.').waitFor()
  await page.getByRole('button', { name: 'Nuova conversazione' }).click()
  await page.getByRole('heading', { name: 'La musica inizia con una domanda.' }).waitFor()
  await page.getByRole('button', { name: 'Ricarica documento' }).click()
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find((button) => button.textContent.includes('Ricarica documento'))?.disabled)

  // Capture the actual desktop layout for review. Kept outside the project.
  await page.screenshot({ path: join(dataDir, 'welcome.png') })
  assert.equal(errors.length, 0, errors.join('\n'))
  // Broken connection is a visible, recoverable chat error.
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  await page.getByRole('button', { name: /Una prima prova/ }).click()
  await page.getByRole('alert').filter({ hasText: 'Connessione a LM Studio non riuscita' }).waitFor()
  assert(aborted, 'L’annullamento non ha chiuso lo stream HTTP')
  console.log('Desktop OK: avvio, impostazioni, chiave cifrata, modelli, chat, fonti, annullamento, nuova chat, ricaricamento ed errore connessione.')
  console.log(`Screenshot: ${join(dataDir, 'welcome.png')}`)
} finally {
  await app?.close()
  server.closeAllConnections()
  if (server.listening) await new Promise((resolve) => server.close(resolve))
  // Keep screenshots for review, remove settings containing test-only credentials.
  await rm(join(dataDir, 'settings.json'), { force: true })
}
