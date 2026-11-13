// NEXUS Prototyp – Desks mit mehreren KI-Workspaces
// - Claude Code: eigene Chat-Ansicht (headless, stream-json) oder Terminal (node-pty)
// - Claude / ChatGPT / Gemini: eingebettete Webseiten (WebContentsView, nur passiv)
// - Pro Projekt ein "Desk": Workspaces, Raster und der jeweils fortzusetzende Chat

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const pty = require('node-pty');
const { listSessions, readHistory } = require('./sessions');
const { ChatSession } = require('./chat');
const { WebViews, PROVIDERS } = require('./webviews');

// --userdata=<ordner> (fuer Selbsttests, damit echte Daten unberuehrt bleiben)
const udArg = process.argv.find((a) => a.startsWith('--userdata='));
app.setPath('userData', udArg ? udArg.slice('--userdata='.length) : path.join(app.getPath('appData'), 'nexus-terminal-test'));
const DATA_FILE = path.join(app.getPath('userData'), 'nexus-data.json');
const PROJECT_ROOT = path.join(os.homedir(), 'Documents', 'Projekt');

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#a855f7', '#84cc16'];
const ICONS = ['🧭', '🏡', '🧠', '🔥', '📚', '🛠️', '🎮', '🌐', '🗂️', '✨'];
const WS_TYPES = ['claude-code', 'claude-code-term', 'claude', 'chatgpt', 'gemini'];

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return null; }
}
let saveTimer = null;
function saveData() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  }, 150);
}

function seedData() {
  const projects = [];
  let i = 0;
  if (fs.existsSync(PROJECT_ROOT)) {
    for (const name of fs.readdirSync(PROJECT_ROOT).sort()) {
      const p = path.join(PROJECT_ROOT, name);
      if (!fs.statSync(p).isDirectory() || name.startsWith('.')) continue;
      projects.push({ id: name.toLowerCase(), name, path: p, color: PALETTE[i % PALETTE.length], icon: ICONS[i % ICONS.length], group: '' });
      i++;
    }
  }
  return { projects, sessionMeta: {}, desks: {} };
}

let data = loadData() || seedData();
data.sessionMeta ||= {};
data.desks ||= {};
data.slashCommands ||= [];
saveData();

let win;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR = /^#[0-9a-f]{6}$/i;
const WSID = /^[a-z0-9-]{4,40}$/;
const projectById = (id) => data.projects.find((p) => p.id === id);

function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_') || k === 'ELECTRON_RUN_AS_NODE') delete env[k];
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  return env;
}
const toUi = (channel, ...args) => win && !win.isDestroyed() && win.webContents.send(channel, ...args);

// ---------- Terminal ----------
const terms = new Map();
let nextTermId = 1;
function openTerminal({ projectId, resumeId, cols, rows }) {
  const project = projectById(projectId);
  if (!project) throw new Error('Unbekanntes Projekt');
  const args = ['/d', '/c', 'claude'];
  if (resumeId) { if (!UUID.test(resumeId)) throw new Error('Ungueltige Sitzungs-ID'); args.push('--resume', resumeId); }
  const proc = pty.spawn(process.env.ComSpec || 'cmd.exe', args, {
    name: 'xterm-256color', cols: Math.max(20, cols | 0) || 120, rows: Math.max(5, rows | 0) || 30,
    cwd: project.path, env: cleanEnv(), useConpty: true,
  });
  const termId = nextTermId++;
  terms.set(termId, { proc });
  proc.onData((d) => toUi('term-data', termId, d));
  proc.onExit(({ exitCode }) => { terms.delete(termId); toUi('term-exit', termId, exitCode); });
  return termId;
}

// ---------- Claude-Code-Chat ----------
const chats = new Map();
let nextChatId = 1;
function openChat({ projectId, resumeId, mode }) {
  const project = projectById(projectId);
  if (!project) throw new Error('Unbekanntes Projekt');
  if (resumeId && !UUID.test(resumeId)) throw new Error('Ungueltige Sitzungs-ID');
  const chatId = nextChatId++;
  const session = new ChatSession({
    cwd: project.path, resumeId, mode, env: cleanEnv(),
    onEvent: (ev) => {
      if (ev.type === 'nexus-exit') chats.delete(chatId);
      if (ev.type === 'raw' && ev.data.type === 'system' && ev.data.subtype === 'init' && Array.isArray(ev.data.slash_commands)) {
        data.slashCommands = ev.data.slash_commands.filter((s) => typeof s === 'string').slice(0, 400);
        saveData();
      }
      toUi('chat-event', chatId, ev);
    },
  });
  chats.set(chatId, session);
  return { chatId, history: resumeId ? readHistory(project.path, resumeId) : [] };
}
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
function buildContent(payload) {
  if (typeof payload === 'string') return payload.trim() && payload.length <= 100000 ? payload : null;
  if (!payload || typeof payload !== 'object') return null;
  const text = typeof payload.text === 'string' ? payload.text.slice(0, 100000) : '';
  const images = Array.isArray(payload.images) ? payload.images.slice(0, 8) : [];
  const content = [];
  for (const img of images) {
    if (!img || !IMAGE_TYPES.has(img.media_type) || typeof img.data !== 'string' || img.data.length > 7_000_000 || !/^[A-Za-z0-9+/=]+$/.test(img.data)) continue;
    content.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
  }
  if (text.trim()) content.push({ type: 'text', text });
  if (!content.length) return null;
  return content.length === 1 && content[0].type === 'text' ? text : content;
}

// ---------- Web-Workspaces ----------
const webviews = new WebViews(() => win, (wsId, state) => toUi('web-state', wsId, state));

// ---------- Desks ----------
function cleanDesk(desk) {
  if (!desk || typeof desk !== 'object') return null;
  const workspaces = (Array.isArray(desk.workspaces) ? desk.workspaces : []).slice(0, 16)
    .filter((w) => w && WSID.test(w.id) && WS_TYPES.includes(w.type))
    .map((w) => ({
      id: w.id, type: w.type,
      title: typeof w.title === 'string' ? w.title.slice(0, 80) : '',
      sessionId: typeof w.sessionId === 'string' && UUID.test(w.sessionId) ? w.sessionId : null,
      url: typeof w.url === 'string' && /^https:\/\/[^\s]{1,500}$/.test(w.url) ? w.url : null,
    }));
  const ids = new Set(workspaces.map((w) => w.id));
  const layout = [1, 2, 3, 4].includes(desk.layout) ? desk.layout : 1;
  const cells = Array.from({ length: 4 }, (_, i) => (Array.isArray(desk.cells) && ids.has(desk.cells[i]) ? desk.cells[i] : null));
  const focus = Number.isInteger(desk.focus) && desk.focus >= 0 && desk.focus < layout ? desk.focus : 0;
  return { layout, cells, focus, workspaces };
}

// ---------- IPC ----------
const fromUi = (e) => win && e.sender === win.webContents;
function handle(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => { if (!fromUi(e)) throw new Error('forbidden'); return fn(...args); });
}
function on(channel, fn) {
  ipcMain.on(channel, (e, ...args) => { if (fromUi(e)) fn(...args); });
}

handle('get-state', () => ({
  projects: data.projects, sessionMeta: data.sessionMeta, desks: data.desks, slashCommands: data.slashCommands,
  palette: PALETTE, icons: ICONS, providers: Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, p.label])),
  lastProject: data.lastProject || null,
}));
handle('list-sessions', (projectId) => { const p = projectById(projectId); return p ? listSessions(p.path) : []; });
handle('save-desk', (projectId, desk) => {
  if (!projectById(projectId)) return null;
  const clean = cleanDesk(desk);
  if (!clean) return null;
  data.desks[projectId] = clean;
  data.lastProject = projectId;
  saveData();
  return clean;
});
handle('open-terminal', (opts) => openTerminal(opts));
handle('open-chat', (opts) => openChat(opts));
handle('chat-send', (chatId, payload) => {
  const content = buildContent(payload);
  if (!content) return false;
  chats.get(chatId)?.send(content);
  return true;
});
handle('chat-permission', (chatId, requestId, decision) => {
  if (['allow', 'always', 'deny'].includes(decision)) chats.get(chatId)?.answerPermission(String(requestId), decision);
});
handle('chat-interrupt', (chatId) => chats.get(chatId)?.interrupt());
handle('chat-mode', (chatId, mode) => chats.get(chatId)?.setMode(mode));
handle('chat-close', (chatId) => { chats.get(chatId)?.close(); chats.delete(chatId); });
handle('update-project', (id, patch) => {
  const p = projectById(id);
  if (!p) return;
  if (patch.color && COLOR.test(patch.color)) p.color = patch.color;
  if (typeof patch.icon === 'string' && patch.icon.length <= 8) p.icon = patch.icon;
  saveData();
  return p;
});
handle('update-session-meta', (sessionId, patch) => {
  if (!UUID.test(sessionId)) return;
  const m = data.sessionMeta[sessionId] || {};
  if (patch.color === null) delete m.color;
  else if (patch.color && COLOR.test(patch.color)) m.color = patch.color;
  if (typeof patch.pinned === 'boolean') m.pinned = patch.pinned;
  data.sessionMeta[sessionId] = m;
  saveData();
  return m;
});
handle('open-folder', (projectId) => { const p = projectById(projectId); if (p) shell.openPath(p.path); });

on('term-input', (termId, d) => terms.get(termId)?.proc.write(d));
on('term-resize', (termId, cols, rows) => { const t = terms.get(termId); if (t && cols > 0 && rows > 0) t.proc.resize(cols, rows); });
on('term-kill', (termId) => terms.get(termId)?.proc.kill());

on('web-ensure', (wsId, type, url) => { if (WSID.test(wsId) && PROVIDERS[type]) webviews.ensure(wsId, type, url); });
on('web-bounds', (wsId, rect) => webviews.setBounds(wsId, rect));
on('web-hide-all', () => webviews.hideAll());
on('web-nav', (wsId, action) => { if (['back', 'reload', 'home', 'external'].includes(action)) webviews.nav(wsId, action); });
on('web-destroy', (wsId) => webviews.destroy(wsId));

// ---------- Fenster ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 920, backgroundColor: '#111216', title: 'NEXUS',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('console-message', (e) => {
    if (e.level === 'warning' || e.level === 'error') console.log(`[ui:${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
  win.webContents.on('preload-error', (e, p, err) => console.log('[preload-error]', err.message));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => {
  createWindow();
  // --selftest=<png>: baut im Test-Datenordner einen Desk auf (ohne Nachrichten zu senden), Screenshot, Ende.
  const st = process.argv.find((a) => a.startsWith('--selftest='));
  if (st) {
    win.webContents.once('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 1500));
      const result = await win.webContents.executeJavaScript('window.__nexusSelftest && window.__nexusSelftest()');
      console.log('[selftest]', JSON.stringify(result));
      await new Promise((r) => setTimeout(r, 7000));
      for (const [id, v] of webviews.views) console.log('[selftest] web', id, v.type, JSON.stringify(v.view.getBounds()), 'sichtbar:', v.view.getVisible(), '|', v.view.webContents.getTitle());
      const img = await win.webContents.capturePage();
      fs.writeFileSync(st.slice('--selftest='.length), img.toPNG());
      console.log('[selftest] screenshot saved');
      app.quit();
    });
  }
});
app.on('window-all-closed', () => {
  for (const t of terms.values()) t.proc.kill();
  for (const c of chats.values()) c.close();
  app.quit();
});
