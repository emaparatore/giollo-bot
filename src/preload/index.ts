import { contextBridge, ipcRenderer } from 'electron'
import type { ChatEvent, DesktopApi } from '../shared/types'

const api: DesktopApi = {
  initialize: () => ipcRenderer.invoke('app:initialize'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  models: (settings) => ipcRenderer.invoke('llm:models', settings),
  reloadDocument: () => ipcRenderer.invoke('document:reload'),
  chat: (request) => ipcRenderer.invoke('chat:start', request),
  cancel: async (id) => { await ipcRenderer.invoke('chat:cancel', id) },
  onChat: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ChatEvent): void => listener(data)
    ipcRenderer.on('chat:event', handler)
    return () => ipcRenderer.removeListener('chat:event', handler)
  }
}

contextBridge.exposeInMainWorld('armonia', api)
