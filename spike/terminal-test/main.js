// NEXUS Phase 0b – Claude Code im eingebetteten Terminal
// Startet das echte Claude Code (mit der vorhandenen Anmeldung) in einem Pseudo-Terminal.
// Liest Sitzungslisten nur lesend; Farben/Pins speichert NEXUS in einer eigenen Datei.

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const pty = require('node-pty');
const { listSessions } = require('./sessions');

app.setPath('userData', path.join(app.getPath('appData'), 'nexus-terminal-test'));
const DATA_FILE = path.join(app.getPath('userData'), 'nexus-data.json');
const PROJECT_ROOT = path.join(os.homedir(), 'Documents', 'Projekt');

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#a855f7', '#84cc16'];
const ICONS = ['🧭', '🏡', '🧠', '🔥', '📚', '🛠️', '🎮', '🌐', '🗂️', '✨'];

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return null;
  }
}
function saveData() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Beim ersten Start: Projektordner unter Documents\Projekt einlesen.
function seedData() {
  const projects = [];
  let i = 0;
  if (fs.existsSync(PROJECT_ROOT)) {
    for (const name of fs.readdirSync(PROJECT_ROOT).sort()) {
      const p = path.join(PROJECT_ROOT, name);
      if (!fs.statSync(p).isDirectory() || name.startsWith('.')) continue;
      projects.push({
        id: name.toLowerCase(),
        name,
        path: p,
        color: PALETTE[i % PALETTE.length],
        icon: ICONS[i % ICONS.length],
        group: '',
      });
      i++;
    }
  }
  return { projects, sessionMeta: {} };
}

let data = loadData() || seedData();
saveData();

let win;
const terms = new Map(); // termId -> { proc, projectId }
let nextTermId = 1;

// Env fuer Claude Code: Variablen einer umgebenden Claude-Code-Sitzung entfernen.
function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_') || k === 'ELECTRON_RUN_AS_NODE') delete env[k];
  }
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  return env;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR = /^#[0-9a-f]{6}$/i;

function projectById(id) {
  return data.projects.find((p) => p.id === id);
}

function openTerminal({ projectId, resumeId, cols, rows }) {
  const project = projectById(projectId);
  if (!project) throw new Error('Unbekanntes Projekt');
  const args = ['/d', '/c', 'claude'];
  if (resumeId) {
    if (!UUID.test(resumeId)) throw new Error('Ungueltige Sitzungs-ID');
    args.push('--resume', resumeId);
  }
  const proc = pty.spawn(process.env.ComSpec || 'cmd.exe', args, {
    name: 'xterm-256color',
    cols: Math.max(20, cols | 0) || 120,
    rows: Math.max(5, rows | 0) || 30,
    cwd: project.path,
    env: cleanEnv(),
    useConpty: true,
  });
  const termId = nextTermId++;
  terms.set(termId, { proc, projectId });
  proc.onData((d) => win && !win.isDestroyed() && win.webContents.send('term-data', termId, d));
  proc.onExit(({ exitCode }) => {
    terms.delete(termId);
    if (win && !win.isDestroyed()) win.webContents.send('term-exit', termId, exitCode);
  });
  return termId;
}

function fromUi(e) {
  return win && e.sender === win.webContents;
}
function handle(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!fromUi(e)) throw new Error('forbidden');
    return fn(...args);
  });
}

handle('get-state', () => ({ projects: data.projects, sessionMeta: data.sessionMeta, palette: PALETTE, icons: ICONS }));
handle('list-sessions', (projectId) => {
  const p = projectById(projectId);
  return p ? listSessions(p.path) : [];
});
handle('open-terminal', (opts) => openTerminal(opts));
handle('update-project', (id, patch) => {
  const p = projectById(id);
  if (!p) return;
  if (patch.color && COLOR.test(patch.color)) p.color = patch.color;
  if (typeof patch.icon === 'string' && patch.icon.length <= 8) p.icon = patch.icon;
  if (typeof patch.group === 'string' && patch.group.length <= 40) p.group = patch.group;
  saveData();
  return p;
});
handle('update-session-meta', (sessionId, patch) => {
  if (!UUID.test(sessionId)) return;
  const m = data.sessionMeta[sessionId] || {};
  if (patch.color === null) delete m.color;
  else if (patch.color && COLOR.test(patch.color)) m.color = patch.color;
  if (typeof patch.pinned === 'boolean') m.pinned = patch.pinned;
  if (typeof patch.label === 'string') m.label = patch.label.slice(0, 80);
  data.sessionMeta[sessionId] = m;
  saveData();
  return m;
});
handle('open-folder', (projectId) => {
  const p = projectById(projectId);
  if (p) shell.openPath(p.path);
});

ipcMain.on('term-input', (e, termId, d) => fromUi(e) && terms.get(termId)?.proc.write(d));
ipcMain.on('term-resize', (e, termId, cols, rows) => {
  if (!fromUi(e)) return;
  const t = terms.get(termId);
  if (t && cols > 0 && rows > 0) t.proc.resize(cols, rows);
});
ipcMain.on('term-kill', (e, termId) => fromUi(e) && terms.get(termId)?.proc.kill());

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#111216',
    title: 'NEXUS – Phase 0b Claude-Code-Arbeitsplatz',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // Fehler der Oberflaeche in die Konsole spiegeln (Entwicklungshilfe).
  win.webContents.on('console-message', (e) => {
    if (e.level === 'warning' || e.level === 'error') console.log(`[ui:${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
  win.webContents.on('preload-error', (e, p, err) => console.log('[preload-error]', err.message));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  for (const t of terms.values()) t.proc.kill();
  app.quit();
});
