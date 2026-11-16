// Preload nur fuer die eigene NEXUS-Oberflaeche – nie fuer Anbieterseiten.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexus', {
  getState: () => ipcRenderer.invoke('get-state'),
  listSessions: (projectId) => ipcRenderer.invoke('list-sessions', projectId),
  saveDesk: (projectId, desk) => ipcRenderer.invoke('save-desk', projectId, desk),
  updateProject: (id, patch) => ipcRenderer.invoke('update-project', id, patch),
  updateSessionMeta: (id, patch) => ipcRenderer.invoke('update-session-meta', id, patch),
  openFolder: (projectId) => ipcRenderer.invoke('open-folder', projectId),
  // Terminal
  openTerminal: (opts) => ipcRenderer.invoke('open-terminal', opts),
  input: (termId, d) => ipcRenderer.send('term-input', termId, d),
  resize: (termId, cols, rows) => ipcRenderer.send('term-resize', termId, cols, rows),
  kill: (termId) => ipcRenderer.send('term-kill', termId),
  onData: (fn) => ipcRenderer.on('term-data', (e, id, d) => fn(id, d)),
  onExit: (fn) => ipcRenderer.on('term-exit', (e, id, code) => fn(id, code)),
  // Claude-Code-Chat
  openChat: (opts) => ipcRenderer.invoke('open-chat', opts),
  chatSend: (id, payload) => ipcRenderer.invoke('chat-send', id, payload),
  chatPermission: (id, reqId, decision) => ipcRenderer.invoke('chat-permission', id, reqId, decision),
  chatInterrupt: (id) => ipcRenderer.invoke('chat-interrupt', id),
  chatMode: (id, mode) => ipcRenderer.invoke('chat-mode', id, mode),
  chatClose: (id) => ipcRenderer.invoke('chat-close', id),
  onChatEvent: (fn) => ipcRenderer.on('chat-event', (e, id, ev) => fn(id, ev)),
  // Web-Workspaces
  webEnsure: (wsId, type, url) => ipcRenderer.send('web-ensure', wsId, type, url),
  webBounds: (wsId, rect) => ipcRenderer.send('web-bounds', wsId, rect),
  webHideAll: () => ipcRenderer.send('web-hide-all'),
  webNav: (wsId, action) => ipcRenderer.send('web-nav', wsId, action),
  webDestroy: (wsId) => ipcRenderer.send('web-destroy', wsId),
  onWebState: (fn) => ipcRenderer.on('web-state', (e, id, s) => fn(id, s)),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  // Meine KIs
  aiStatus: () => ipcRenderer.invoke('ai-status'),
  aiAdd: (ids, custom) => ipcRenderer.invoke('ai-add', ids, custom),
  aiLogin: (id) => ipcRenderer.invoke('ai-login', id),
  aiLogout: (id) => ipcRenderer.invoke('ai-logout', id),
  aiRemove: (id) => ipcRenderer.invoke('ai-remove', id),
  onAiStatus: (fn) => ipcRenderer.on('ai-status', (e, id, s) => fn(id, s)),
});
