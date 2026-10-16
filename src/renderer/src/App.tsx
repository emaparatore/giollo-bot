import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowDown, ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, Copy, FileText, Headphones,
  LoaderCircle, MessageCircle, Music2, Plus, RefreshCw, Send, Settings2, ShieldCheck, Square, Unplug, X } from 'lucide-react'
import { DEFAULT_SETTINGS, type ChatEvent, type DocumentInfo, type Settings, type Source, type Turn } from '../../shared/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources: Source[]
  state?: 'streaming' | 'done' | 'error' | 'cancelled'
  error?: string
}

const SUGGESTIONS = [
  { icon: Music2, title: 'Trova il tuo corso', text: 'Quali corsi posso iniziare da adulto, senza esperienza?' },
  { icon: FileText, title: 'Costi e iscrizioni', text: 'Quanto costa un anno di pianoforte da 30 minuti, inclusa l’iscrizione?' },
  { icon: Headphones, title: 'Una prima prova', text: 'Come funziona la lezione di prova e quanto costa?' },
  { icon: CircleHelp, title: 'Assenze e recuperi', text: 'Se non posso partecipare a una lezione, come posso recuperarla?' }
]

function cleanAnswer(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/gi, '').trimStart()
}

function Markdown({ text, sources = [], onSource }: { text: string; sources?: Source[]; onSource?: (source: Source) => void }): ReactNode {
  const content = cleanAnswer(text).replace(/\[(S\d+)\](?!\()/g, (match, id: string) =>
    sources.some((source) => source.id === id) ? `[${id}](source:${id})` : match)
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={['img']}
    urlTransform={(url) => url.startsWith('source:') ? url : ''}
    components={{ a: ({ href, children }) => {
      const source = sources.find((item) => `source:${item.id}` === href)
      return source && onSource
        ? <button className="inline-citation" title={source.title} onClick={() => onSource(source)}>{children}</button>
        : <span>{children}</span>
    } }}>{content}</ReactMarkdown></div>
}

function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const root = ref.current
    const focusable = (): HTMLElement[] => Array.from(root?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])
    focusable()[0]?.focus()
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeRef.current()
      if (event.key === 'Tab') {
        const items = focusable()
        const first = items[0], last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); previous?.focus() }
  }, [])
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`dialog ${wide ? 'dialog-wide' : ''}`}>
      <header className="dialog-header"><h2>{title}</h2><button className="icon-button" aria-label="Chiudi finestra" onClick={onClose}><X size={20} /></button></header>
      {children}
    </div>
  </div>
}

function SettingsDialog({ settings, onClose, onSaved }: { settings: Settings; onClose: () => void; onSaved: (value: Settings, checked: boolean) => void }): ReactNode {
  const [draft, setDraft] = useState(settings)
  const [models, setModels] = useState<string[]>([])
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [checked, setChecked] = useState(false)
  const change = <K extends keyof Settings>(key: K, value: Settings[K]): void => {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setSuccess(''); setError(''); setChecked(false)
  }
  const testConnection = async (): Promise<void> => {
    setChecking(true); setError(''); setSuccess('')
    try {
      const result = await window.armonia.models(draft)
      if (!result.ok) { setError(result.error); setChecked(false); return }
      setModels(result.value)
      if (!result.value.length) { setError('Server raggiungibile, ma nessun modello disponibile. Carica un modello di chat in LM Studio.'); return }
      if (!result.value.includes(draft.model)) {
        setDraft((previous) => ({ ...previous, model: result.value.find((id) => !/embed/i.test(id)) ?? result.value[0] }))
      }
      setSuccess(`Server raggiungibile · ${result.value.length} modell${result.value.length === 1 ? 'o disponibile' : 'i disponibili'}`)
      setChecked(true)
    } catch { setError('Impossibile verificare la connessione. Riprova.'); setChecked(false) }
    finally { setChecking(false) }
  }
  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const result = await window.armonia.saveSettings(draft)
      if (result.ok) onSaved(result.value, checked)
      else setError(result.error)
    } catch { setError('Non è stato possibile salvare le impostazioni.') }
    finally { setSaving(false) }
  }
  return <Dialog title="Collega il tuo modello" onClose={() => { if (!saving) onClose() }}>
    <form className="settings-body" onSubmit={(event) => void save(event)}>
      <div className="setup-note"><Unplug size={21} /><p>In <strong>LM Studio</strong> carica un modello di chat e avvia il server nella scheda <strong>Developer</strong>. L’app si collega direttamente al tuo server.</p></div>
      <label htmlFor="server">Indirizzo del server</label>
      <div className="input-action"><input id="server" value={draft.baseUrl} onChange={(event) => change('baseUrl', event.target.value)} placeholder="http://localhost:1234/v1" required disabled={checking || saving} />
        <button type="button" className="secondary-button" onClick={() => void testConnection()} disabled={checking || saving}>{checking ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />} Verifica connessione</button></div>
      <label htmlFor="model">Modello di chat</label>
      <input id="model" list="model-options" value={draft.model} onChange={(event) => change('model', event.target.value)} placeholder="Verifica la connessione oppure inserisci l’identificativo" disabled={checking || saving} />
      <datalist id="model-options">{models.map((model) => <option key={model} value={model} />)}</datalist>
      <p className="field-help">Scegli un modello instruct con supporto per l’italiano. I modelli per embeddings non generano risposte.</p>
      <label htmlFor="api-key">Chiave API <span className="optional">facoltativa</span></label>
      <input id="api-key" type="password" autoComplete="off" value={draft.apiKey} onChange={(event) => change('apiKey', event.target.value)} placeholder="Solo se richiesta dal server" disabled={checking || saving} />
      <p className="field-help">Se presente, viene salvata usando la protezione delle credenziali di Windows.</p>
      <label htmlFor="context">Dimensione dei passaggi documentali</label>
      <select id="context" value={draft.contextChars} disabled={checking || saving} onChange={(event) => change('contextChars', Number(event.target.value))}>
        <option value={8000}>8.000 caratteri · contesto ridotto</option><option value={16000}>16.000 caratteri · bilanciato</option><option value={24000}>24.000 caratteri · contesto ampio</option>
      </select>
      <p className="field-help">A questi si aggiungono istruzioni, cronologia e risposta. Se LM Studio segnala un contesto insufficiente, riduci questa opzione o aumenta quello del modello.</p>
      {error && <p className="notice error" role="alert">{error}</p>}
      {success && <p className="notice success" role="status"><Check size={16} />{success}</p>}
      <footer className="dialog-footer"><button type="button" className="text-button" onClick={onClose} disabled={saving}>Annulla</button><button className="primary-button" type="submit" disabled={checking || saving}>{saving && <LoaderCircle size={16} className="spin" />}Salva impostazioni</button></footer>
    </form>
  </Dialog>
}

function Answer({ message, onSource }: { message: Message; onSource: (source: Source, all: Source[]) => void }): ReactNode {
  const [copied, setCopied] = useState(false)
  const content = cleanAnswer(message.content)
  const refs = [...content.matchAll(/\[(S\d+)\]/g)].map((match) => match[1])
  const invalidCitations = refs.some((id) => !message.sources.some((source) => source.id === id))
  const copy = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 1800) }
    catch { setCopied(false) }
  }
  return <article className="answer-row">
    <div className="assistant-avatar"><Music2 size={19} /></div>
    <div className="answer-content"><div className="answer-label">Armonia <span>ASSISTENTE</span></div>
      {content ? <Markdown text={content} sources={message.sources} onSource={(source) => onSource(source, message.sources)} />
        : message.state === 'streaming' ? <div className="thinking"><span /><span /><span /><small>{message.sources.length ? 'Preparo la risposta…' : 'Consulto la guida…'}</small></div> : null}
      {message.error && <p className="notice error" role="alert">{message.error}</p>}
      {message.state === 'cancelled' && <p className="answer-note">Generazione interrotta{content ? '. Il testo potrebbe essere incompleto.' : '.'}</p>}
      {message.state === 'done' && content && message.sources.length > 0 && (!refs.length || invalidCitations) && <p className="answer-note">{invalidCitations ? 'La risposta contiene riferimenti non disponibili. Verifica i passaggi qui sotto.' : 'Il modello non ha indicato riferimenti puntuali. Verifica i passaggi consultati.'}</p>}
      {message.sources.length > 0 && <div className="sources-block"><div className="sources-label"><BookOpen size={13} /> PASSAGGI CONSULTATI <span>{message.sources.length}</span></div>
        <div className="source-chips">{message.sources.map((source) => <button className={`source-chip ${refs.includes(source.id) ? 'cited' : ''}`} key={source.id} onClick={() => onSource(source, message.sources)} title={source.title}><span>{source.id}</span>{source.title.split(' › ').at(-1)}<ChevronRight size={13} /></button>)}</div></div>}
      {content && message.state !== 'streaming' && <button className="copy-button" onClick={() => void copy()} aria-label="Copia risposta">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copiata' : 'Copia risposta'}</button>}
    </div>
  </article>
}

export function App(): ReactNode {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [documentInfo, setDocumentInfo] = useState<DocumentInfo | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'error'>('unknown')
  const [banner, setBanner] = useState('')
  const [reloading, setReloading] = useState(false)
  const [sourceView, setSourceView] = useState<{ selected: Source; all: Source[] } | null>(null)
  const [showScroll, setShowScroll] = useState(false)
  const activeId = useRef<string | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const follow = useRef(true)

  const initialize = async (): Promise<void> => {
    setInitializing(true); setBanner('')
    try {
      const result = await window.armonia.initialize()
      if (!result.ok) { setBanner(result.error); return }
      setSettings(result.value.settings); setDocumentInfo(result.value.document)
      if (result.value.settingsWarning) setBanner(result.value.settingsWarning)
      if (result.value.settings.model) {
        const status = await window.armonia.models(result.value.settings)
        setConnection(status.ok && status.value.includes(result.value.settings.model) ? 'connected' : 'error')
      }
    } catch { setBanner('Impossibile inizializzare l’app. Prova a riaprirla.') }
    finally { setInitializing(false) }
  }

  useEffect(() => { void initialize() }, [])
  useEffect(() => window.armonia.onChat((event: ChatEvent) => {
    if (event.id !== activeId.current) return
    setMessages((previous) => previous.map((message) => {
      if (message.id !== event.id) return message
      if (event.type === 'sources') return { ...message, sources: event.sources }
      if (event.type === 'delta') return { ...message, content: message.content + event.text }
      if (event.type === 'error') return { ...message, state: 'error', error: event.message }
      if (event.type === 'done') return { ...message, state: event.cancelled ? 'cancelled' : 'done' }
      return message
    }))
    if (event.type === 'done' || event.type === 'error') {
      activeId.current = null; setBusy(false)
      if (event.type === 'error') setConnection('error')
      else if (!event.cancelled) setConnection((previous) => previous === 'unknown' ? previous : 'connected')
      textarea.current?.focus()
    }
  }), [])

  useEffect(() => {
    if (follow.current && scroll.current) scroll.current.scrollTop = messages.length ? scroll.current.scrollHeight : 0
  }, [messages])
  useEffect(() => {
    if (textarea.current) { textarea.current.style.height = 'auto'; textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 150)}px` }
  }, [input])

  const send = async (question = input): Promise<void> => {
    if (activeId.current || !question.trim() || !documentInfo) return
    if (!settings.model) { setInput(question); setSettingsOpen(true); return }
    const id = crypto.randomUUID()
    const history: Turn[] = messages.filter((message) => message.state !== 'error' && message.state !== 'cancelled' && message.content.trim())
      .slice(-40).map((message) => ({ role: message.role, content: message.role === 'assistant' ? cleanAnswer(message.content) : message.content }))
    activeId.current = id; setBusy(true); setInput(''); setBanner(''); follow.current = true; setShowScroll(false)
    setMessages((previous) => [...previous, { id: `user-${id}`, role: 'user', content: question.trim(), sources: [] }, { id, role: 'assistant', content: '', sources: [], state: 'streaming' }])
    try {
      const result = await window.armonia.chat({ id, question: question.trim(), history })
      if (!result.ok && activeId.current === id) {
        activeId.current = null; setBusy(false)
        setMessages((previous) => previous.map((message) => message.id === id ? { ...message, state: 'error', error: result.error } : message))
      }
    } catch {
      activeId.current = null; setBusy(false)
      setMessages((previous) => previous.map((message) => message.id === id ? { ...message, state: 'error', error: 'Invio non riuscito. Riprova.' } : message))
    }
  }

  const cancel = (): void => { if (activeId.current) void window.armonia.cancel(activeId.current) }
  const reset = (): void => {
    if (busy) return
    setMessages([]); setInput(''); setSourceView(null); follow.current = true; setShowScroll(false); textarea.current?.focus()
  }
  const reload = async (): Promise<void> => {
    setReloading(true); setBanner('')
    try {
      const result = await window.armonia.reloadDocument()
      if (result.ok) { setDocumentInfo(result.value); reset() }
      else setBanner(result.error)
    } catch { setBanner('Ricaricamento della documentazione non riuscito.') }
    finally { setReloading(false) }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-symbol"><Music2 size={26} strokeWidth={1.8} /></div><div>armonia<span>ACCADEMIA MUSICALE</span></div></div>
      <button className="new-chat" onClick={reset} disabled={busy}><Plus size={18} />Nuova conversazione</button>
      <div className="sidebar-section-label">IL TUO SPAZIO</div>
      <div className="nav-active"><MessageCircle size={18} /><span>Assistente della scuola</span><span className="nav-dot" /></div>
      <div className="sidebar-document"><div className="sidebar-section-label">BASE DOCUMENTALE</div><div className="document-card"><div className="document-icon"><FileText size={20} /></div><strong>Guida della scuola</strong><span>Anno didattico 2026–2027</span><div className="document-ready"><span className={`status-dot ${documentInfo ? '' : 'muted'}`} />{documentInfo ? `${documentInfo.sectionCount} sezioni indicizzate` : 'Caricamento guida…'}</div><button onClick={() => void reload()} disabled={busy || reloading || initializing}><RefreshCw size={13} className={reloading ? 'spin' : ''} />{reloading ? 'Ricaricamento…' : 'Ricarica documento'}</button></div></div>
      <div className="sidebar-bottom"><div className="local-note"><ShieldCheck size={19} /><div><strong>Il tuo modello, in locale</strong><p>La chat usa il server che configuri. Nessun servizio AI preimpostato.</p></div></div>
        <button className="settings-nav" onClick={() => setSettingsOpen(true)} disabled={busy}><Settings2 size={18} />Impostazioni<ChevronRight size={15} /></button>
        <div className="sidebar-foot">ARMONIA ASSISTENTE <span>v1.0</span></div></div>
    </aside>

    <main className="main-panel">
      <header className="topbar"><div><span className="eyebrow">CHIEDI, SCOPRI, SUONA.</span><h1>Assistente della scuola</h1></div><button className={`connection-badge ${connection}`} onClick={() => setSettingsOpen(true)} disabled={busy}><span className="status-dot" />{connection === 'connected' ? 'LM Studio collegato' : connection === 'error' ? 'Verifica connessione' : 'Configura LM Studio'}<Settings2 size={13} /></button></header>
      {banner && <div className="top-notice notice error" role="alert"><span>{banner}</span><button className="text-button" onClick={() => void initialize()} disabled={initializing}>Riprova</button><button className="icon-button" aria-label="Chiudi avviso" onClick={() => setBanner('')}><X size={16} /></button></div>}
      <div className="conversation" ref={scroll} onScroll={() => {
        const area = scroll.current
        if (area) { follow.current = area.scrollHeight - area.scrollTop - area.clientHeight < 90; setShowScroll(!follow.current && messages.length > 0) }
      }}>
        {!messages.length ? <section className="welcome"><div className="welcome-mark"><Music2 size={36} strokeWidth={1.5} /><span className="welcome-spark">✦</span></div><div className="welcome-kicker">BENVENUTO IN ARMONIA</div><h2>La musica inizia<br />con una <span>domanda.</span></h2><p className="welcome-description">Corsi, iscrizioni o una prima lezione?<br />Ti aiuto a trovare le risposte nella guida della scuola.</p>
          <div className="suggestions">{SUGGESTIONS.map(({ icon: Icon, title, text }) => <button key={title} className="suggestion" disabled={initializing || !documentInfo} onClick={() => void send(text)}><div className="suggestion-top"><Icon size={20} /><ArrowRight size={16} /></div><strong>{title}</strong><p>{text}</p></button>)}</div>
          <div className="grounded-note"><BookOpen size={14} />Risposte basate sulla documentazione, con fonti consultabili.</div>
        </section> : <div className="message-list">{messages.map((message) => message.role === 'user'
          ? <div key={message.id} className="question-row"><div className="question-bubble">{message.content}</div><div className="user-avatar">TU</div></div>
          : <Answer key={message.id} message={message} onSource={(selected, all) => setSourceView({ selected, all })} />)}<div className="conversation-end" /></div>}
      </div>
      <div className="composer-area">{showScroll && <button className="scroll-bottom" onClick={() => { follow.current = true; setShowScroll(false); scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' }) }}><ArrowDown size={15} />Torna all’ultima risposta</button>}
        <form className={`composer ${busy ? 'composer-busy' : ''}`} onSubmit={(event) => { event.preventDefault(); void send() }}><textarea ref={textarea} aria-label="La tua domanda" value={input} onChange={(event) => setInput(event.target.value)} maxLength={4000} rows={1} placeholder="Chiedi qualcosa sulla scuola di musica…" disabled={initializing || !documentInfo} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy) void send() } }} /><div className="composer-actions">{input.length > 3500 && <span>{input.length}/4000</span>}{busy ? <button type="button" className="send-button stop" onClick={cancel} aria-label="Interrompi risposta"><Square size={17} fill="currentColor" /></button> : <button type="submit" className="send-button" disabled={!input.trim() || initializing || !documentInfo} aria-label="Invia domanda"><Send size={19} /></button>}</div></form>
        <div className="composer-meta"><span>Invio per inviare <span className="meta-separator">·</span> Maiusc + Invio per andare a capo</span><span><ShieldCheck size={12} />Ricerca locale nella guida</span></div>
        <p className="fiction-note">Scuola immaginaria · Guida aggiornata al {documentInfo?.updated.split(',')[0] ?? '15 ottobre 2026'}. Verifica le risposte nelle fonti.</p>
      </div>
    </main>

    {settingsOpen && <SettingsDialog settings={settings} onClose={() => setSettingsOpen(false)} onSaved={(value, checked) => { setSettings(value); setSettingsOpen(false); setConnection(checked ? 'connected' : 'unknown'); setBanner(''); textarea.current?.focus() }} />}
    {sourceView && <Dialog title="Dentro la documentazione" wide onClose={() => setSourceView(null)}><div className="source-dialog-body"><div className="source-navigation">{sourceView.all.map((source) => <button className={source.id === sourceView.selected.id ? 'selected' : ''} key={source.id} onClick={() => setSourceView({ ...sourceView, selected: source })}>{source.id}</button>)}</div><div className="source-document-label"><FileText size={15} />{documentInfo?.name}</div><h3>{sourceView.selected.title}</h3><div className="source-metadata">Righe {sourceView.selected.startLine}–{sourceView.selected.endLine} · Testo originale</div><Markdown text={sourceView.selected.text} /><div className="source-footer"><BookOpen size={15} />Un riferimento indica il passaggio consultato. Controlla che sostenga la risposta.</div></div></Dialog>}
  </div>
}
