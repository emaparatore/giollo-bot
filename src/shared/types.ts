export interface Settings {
  baseUrl: string
  model: string
  apiKey: string
  contextChars: number
}

export interface Source {
  id: string
  title: string
  text: string
  startLine: number
  endLine: number
}

export interface DocumentInfo {
  name: string
  updated: string
  sectionCount: number
}

export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  id: string
  question: string
  history: Turn[]
}

export type ChatEvent =
  | { id: string; type: 'sources'; sources: Source[] }
  | { id: string; type: 'delta'; text: string }
  | { id: string; type: 'done'; cancelled?: boolean }
  | { id: string; type: 'error'; message: string }

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface DesktopApi {
  initialize(): Promise<Result<{ settings: Settings; document: DocumentInfo; settingsWarning: string }>>
  saveSettings(settings: Settings): Promise<Result<Settings>>
  models(settings: Settings): Promise<Result<string[]>>
  reloadDocument(): Promise<Result<DocumentInfo>>
  chat(request: ChatRequest): Promise<Result<null>>
  cancel(id: string): Promise<void>
  onChat(listener: (event: ChatEvent) => void): () => void
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: 'http://localhost:1234/v1',
  model: '',
  apiKey: '',
  contextChars: 16000
}
