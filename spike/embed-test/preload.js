// Preload nur fuer die eigene Toolbar, nie fuer Anbieterseiten.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexus', {
  activate: (key) => ipcRenderer.send('activate', key),
  reload: () => ipcRenderer.send('reload'),
  home: () => ipcRenderer.send('home'),
  openExternal: () => ipcRenderer.send('open-external'),
  relaunch: () => ipcRenderer.send('relaunch'),
  clearSession: () => ipcRenderer.send('clear-session'),
  onInit: (fn) => ipcRenderer.on('init', (e, data) => fn(data)),
  onState: (fn) => ipcRenderer.on('state', (e, data) => fn(data)),
});
