import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { KnowledgeBase } from './retrieval'
import { buildMessages, getModels, normalizeSettings, readableError, streamAnswer } from './llm'
import { DEFAULT_SETTINGS, type ChatEvent, type ChatRequest, type Result, type Settings, type Turn } from '../shared/types'

let window: BrowserWindow | null = null
let knowledge: KnowledgeBase | undefined
let settings = { ...DEFAULT_SETTINGS }
const active = new Map<string, AbortController>()

if (!app.isPackaged && process.env.ARMONIA_TEST_USER_DATA) app.setPath('userData', process.env.ARMONIA_TEST_USER_DATA)

function docPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'DOCUMENTAZIONE_SCUOLA_MUSICA_ARMONIA.md')
    : join(__dirname, '../../DOCUMENTAZIONE_SCUOLA_MUSICA_ARMONIA.md')
}

async function loadDocument(): Promise<KnowledgeBase> {
  try { return new KnowledgeBase(await readFile(docPath(), 'utf8')) }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error('Documento non trovato. Ripristina DOCUMENTAZIONE_SCUOLA_MUSICA_ARMONIA.md nella cartella del progetto o resources dell’app installata.')
    }
    throw error
  }
}

async function loadSettings(): Promise<void> {
  try {
    const stored = JSON.parse(await readFile(join(app.getPath('userData'), 'settings.json'), 'utf8'))
    let apiKey = ''
    if (stored.encryptedKey) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Impossibile aprire la chiave salvata. Reinseriscila nelle impostazioni.')
      apiKey = safeStorage.decryptString(Buffer.from(stored.encryptedKey, 'base64'))
    }
    settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...stored, apiKey })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
    throw new Error('Impossibile leggere le impostazioni salvate. Apri le impostazioni e salvale nuovamente.')
  }
}

async function saveSettings(input: unknown): Promise<Settings> {
  if (active.size) throw new Error('Interrompi la risposta prima di modificare le impostazioni.')
  const next = normalizeSettings(input)
  if (next.apiKey && !safeStorage.isEncryptionAvailable()) throw new Error('La protezione delle credenziali di Windows non è disponibile. Non è possibile salvare la chiave API.')
  const { apiKey, ...plain } = next
  const stored = { ...plain, encryptedKey: apiKey ? safeStorage.encryptString(apiKey).toString('base64') : '' }
  const path = join(app.getPath('userData'), 'settings.json')
  await writeFile(`${path}.tmp`, JSON.stringify(stored, null, 2), { encoding: 'utf8', mode: 0o600 })
  await rename(`${path}.tmp`, path)
  settings = next
  startupSettingsError = ''
  return settings
}

function parseRequest(input: unknown): ChatRequest {
  const value = input as ChatRequest | null
  if (!value || typeof value.id !== 'string' || !/^[\w-]{1,80}$/.test(value.id)
    || typeof value.question !== 'string' || !value.question.trim() || value.question.length > 4000
    || !Array.isArray(value.history) || value.history.length > 100) throw new Error('Domanda non valida o troppo lunga (massimo 4.000 caratteri).')
  const history: Turn[] = []
  for (const turn of value.history) {
    if (!turn || !['user', 'assistant'].includes(turn.role) || typeof turn.content !== 'string' || turn.content.length > 30000) {
      throw new Error('Cronologia della conversazione non valida.')
    }
    history.push({ role: turn.role, content: turn.content })
  }
  return { id: value.id, question: value.question.trim(), history }
}

function emit(event: ChatEvent): void {
  if (window && !window.isDestroyed()) window.webContents.send('chat:event', event)
}

async function answer(request: ChatRequest, controller: AbortController): Promise<void> {
  try {
    if (!knowledge) knowledge = await loadDocument()
    const sources = knowledge.search(request.question, request.history, settings.contextChars)
    emit({ id: request.id, type: 'sources', sources })
    if (!sources.length) {
      emit({ id: request.id, type: 'delta', text: 'Non ho trovato nella guida passaggi pertinenti per rispondere. Puoi riformulare la domanda specificando il corso o l’argomento? Posso aiutarti con corsi, tariffe, iscrizioni, calendario e regolamento dell’Accademia Musicale Armonia.' })
    } else {
      if (!settings.model) throw new Error('Seleziona un modello nelle impostazioni prima di inviare una domanda.')
      await streamAnswer(settings, buildMessages(request.question, request.history, sources, knowledge.info.updated), controller.signal,
        (text) => emit({ id: request.id, type: 'delta', text }))
    }
    emit({ id: request.id, type: 'done' })
  } catch (error) {
    if (controller.signal.aborted) emit({ id: request.id, type: 'done', cancelled: true })
    else emit({ id: request.id, type: 'error', message: readableError(error) })
  } finally { active.delete(request.id) }
}

let startupSettingsError = ''

function registerIpc(): void {
  const handle = <T>(channel: string, action: (input: unknown) => Promise<T>): void => {
    ipcMain.handle(channel, async (event, input): Promise<Result<T>> => {
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return { ok: false, error: 'Richiesta non autorizzata.' }
      try { return { ok: true, value: await action(input) } }
      catch (error) { return { ok: false, error: readableError(error) } }
    })
  }
  handle('app:initialize', async () => {
    if (!knowledge) knowledge = await loadDocument()
    return { settings, document: knowledge.info, settingsWarning: startupSettingsError }
  })
  handle('settings:save', saveSettings)
  handle('llm:models', async (input) => getModels(normalizeSettings(input)))
  handle('document:reload', async () => {
    if (active.size) throw new Error('Interrompi la risposta prima di ricaricare la documentazione.')
    knowledge = await loadDocument()
    return knowledge.info
  })
  handle('chat:start', async (input) => {
    const request = parseRequest(input)
    if (active.size) throw new Error('Una risposta è già in corso.')
    const controller = new AbortController()
    active.set(request.id, controller)
    void answer(request, controller)
    return null
  })
  handle('chat:cancel', async (input) => {
    if (typeof input === 'string') active.get(input)?.abort()
    return null
  })
}

async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: 1240, height: 860, minWidth: 860, minHeight: 640,
    title: 'Armonia · Assistente', backgroundColor: '#f8f9fc', autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.on('closed', () => { for (const controller of active.values()) controller.abort(); window = null })
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await window.loadFile(join(__dirname, '../renderer/index.html'))
}

void app.whenReady().then(async () => {
  app.setAppUserModelId('it.armonia.assistente')
  try { await loadSettings() } catch (error) { startupSettingsError = readableError(error) }
  registerIpc()
  await createWindow()
}).catch((error) => { console.error(readableError(error)); app.quit() })

app.on('window-all-closed', () => app.quit())
