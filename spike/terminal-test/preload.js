const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexus', {
  getState: () => ipcRenderer.invoke('get-state'),
  listSessions: (projectId) => ipcRenderer.invoke('list-sessions', projectId),
  openTerminal: (opts) => ipcRenderer.invoke('open-terminal', opts),
  updateProject: (id, patch) => ipcRenderer.invoke('update-project', id, patch),
  updateSessionMeta: (id, patch) => ipcRenderer.invoke('update-session-meta', id, patch),
  openFolder: (projectId) => ipcRenderer.invoke('open-folder', projectId),
  input: (termId, d) => ipcRenderer.send('term-input', termId, d),
  resize: (termId, cols, rows) => ipcRenderer.send('term-resize', termId, cols, rows),
  kill: (termId) => ipcRenderer.send('term-kill', termId),
  onData: (fn) => ipcRenderer.on('term-data', (e, id, d) => fn(id, d)),
  onExit: (fn) => ipcRenderer.on('term-exit', (e, id, code) => fn(id, code)),
  // Chat (Claude Code headless)
  openChat: (opts) => ipcRenderer.invoke('open-chat', opts),
  chatSend: (id, text) => ipcRenderer.invoke('chat-send', id, text),
  chatPermission: (id, reqId, decision) => ipcRenderer.invoke('chat-permission', id, reqId, decision),
  chatInterrupt: (id) => ipcRenderer.invoke('chat-interrupt', id),
  chatMode: (id, mode) => ipcRenderer.invoke('chat-mode', id, mode),
  chatClose: (id) => ipcRenderer.invoke('chat-close', id),
  onChatEvent: (fn) => ipcRenderer.on('chat-event', (e, id, ev) => fn(id, ev)),
});
