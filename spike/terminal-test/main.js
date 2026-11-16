// NEXUS Prototyp – Desks mit mehreren KI-Workspaces
// - Claude Code: eigene Chat-Ansicht (headless, stream-json) oder Terminal (node-pty)
// - Claude / ChatGPT / Gemini: eingebettete Webseiten (WebContentsView, nur passiv)
// - Pro Projekt ein "Desk": Workspaces, Raster und der jeweils fortzusetzende Chat

const { app, BrowserWindow, ipcMain, shell, nativeTheme, dialog, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const pty = require('node-pty');
const { listSessions, readHistory } = require('./sessions');
const { ChatSession } = require('./chat');
const { WebViews, CATALOG, AI_ID, RESERVED, customAi } = require('./webviews');

// --userdata=<ordner> (fuer Selbsttests, damit echte Daten unberuehrt bleiben)
const udArg = process.argv.find((a) => a.startsWith('--userdata='));
app.setPath('userData', udArg ? udArg.slice('--userdata='.length) : path.join(app.getPath('appData'), 'nexus-terminal-test'));
const DATA_FILE = path.join(app.getPath('userData'), 'nexus-data.json');
const PROJECT_ROOT = path.join(os.homedir(), 'Documents', 'Projekt');

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#a855f7', '#84cc16'];
const ICONS = ['🧭', '🏡', '🧠', '🔥', '📚', '🛠️', '🎮', '🌐', '🗂️', '✨'];
const CODE_TYPES = ['claude-code', 'claude-code-term'];

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
data.settings ||= {};
// Theme der KIs: wird den Seiten als prefers-color-scheme gemeldet (Standard: dunkel, passend zu NEXUS).
const SETTINGS = {
  confirmRemove: (v) => typeof v === 'boolean',
  theme: (v) => Object.hasOwn(THEMES, v),
  // zwischen diesen beiden wechselt der Sonne/Mond-Knopf
  lightTheme: (v) => THEMES[v]?.mode === 'light',
  darkTheme: (v) => THEMES[v]?.mode === 'dark',
  chatMode: (v) => ['default', 'acceptEdits', 'auto', 'plan'].includes(v),
  chatModel: (v) => typeof v === 'string' && /^[a-z0-9.\-]{1,60}$/i.test(v),
  notify: (v) => typeof v === 'boolean',
};
// Themes: mode bestimmt, was den KI-Seiten als prefers-color-scheme gemeldet wird; bg ist die Fensterfarbe beim Start.
// Die Farben selbst stehen in app.css (:root[data-theme=…]).
const THEMES = {
  hell: { mode: 'light', bg: '#f5f6f8' }, creme: { mode: 'light', bg: '#f7f3ea' }, sand: { mode: 'light', bg: '#ece4d4' },
  nacht: { mode: 'dark', bg: '#111216' }, retro: { mode: 'dark', bg: '#050805' }, kupfer: { mode: 'dark', bg: '#1a1714' },
};
// alte Einstellung (aiTheme hell/dunkel) uebernehmen
if (!THEMES[data.settings.theme]) data.settings.theme = data.settings.aiTheme === 'light' ? 'hell' : 'nacht';
delete data.settings.aiTheme;
if (THEMES[data.settings.lightTheme]?.mode !== 'light') data.settings.lightTheme = 'hell';
if (THEMES[data.settings.darkTheme]?.mode !== 'dark') data.settings.darkTheme = 'nacht';
const theme = () => THEMES[data.settings.theme] || THEMES.nacht;
const bgColor = () => theme().bg;
function applyTheme() {
  nativeTheme.themeSource = theme().mode;
  if (win && !win.isDestroyed()) win.setBackgroundColor(bgColor());
}
// "Meine KIs": Web-KIs, die in NEXUS aufgenommen sind (Anmeldung je KI gilt fuer alle Desks).
// Erststart nach dem Update: alle KIs uebernehmen, die schon in einem Desk stecken.
if (!Array.isArray(data.ais)) {
  const used = new Set();
  for (const d of Object.values(data.desks)) for (const w of d.workspaces || []) if (CATALOG[w.type]) used.add(w.type);
  data.ais = [...used].map((id) => ({ id }));
}
const aiById = (id) => data.ais.find((a) => a.id === id) || null;
const isWsType = (t) => CODE_TYPES.includes(t) || !!aiById(t);
function publicAis() {
  return data.ais.map((a) => {
    const c = CATALOG[a.id];
    return c ? { id: a.id, label: c.label, icon: c.icon, color: c.color, url: c.url, verifiable: !!c.authCookie }
      : { id: a.id, label: a.label, icon: a.icon, color: a.color, url: a.url, custom: true, verifiable: false };
  });
}
saveData();

let win;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR = /^#[0-9a-f]{6}$/i;
const WSID = /^[a-z0-9-]{4,40}$/;
const projectById = (id) => data.projects.find((p) => p.id === id);

// ---------- Projekte verwalten ----------
// NEXUS fuehrt eine eigene Liste (nexus-data.json). Ordner auf der Platte werden nie geloescht.
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const sortProjects = () => data.projects.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
function cleanName(name) {
  const n = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (!n || n.length > 60) throw new Error('Bitte einen Namen mit 1–60 Zeichen angeben.');
  return n;
}
// Ordnername fuer "neuer Ordner": keine Pfadtrenner oder unter Windows verbotene Zeichen
function folderName(name) {
  if (/[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) {
    throw new Error('Der Name enthält Zeichen, die als Ordnername nicht erlaubt sind.');
  }
  return name;
}
function newProjectId(name) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'projekt';
  let id = base;
  for (let i = 2; projectById(id); i++) id = `${base}-${i}`;
  return id;
}
function checkFolder(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p) || !isDir(p)) throw new Error('Der Ordner existiert nicht.');
  return path.resolve(p);
}
const publicProjects = () => data.projects.map((p) => ({ ...p, missing: !isDir(p.path) }));
// Ordner in Dokumente\Projekt, die noch nicht in NEXUS sind
function unlistedFolders() {
  if (!isDir(PROJECT_ROOT)) return [];
  return fs.readdirSync(PROJECT_ROOT).filter((n) => !n.startsWith('.') && isDir(path.join(PROJECT_ROOT, n)))
    .map((n) => path.join(PROJECT_ROOT, n)).filter((p) => !data.projects.some((x) => samePath(x.path, p)))
    .sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
}
function createProject({ name, folder, newFolder, icon, color }) {
  const n = cleanName(name);
  let dir;
  if (newFolder) {
    dir = path.join(PROJECT_ROOT, folderName(n));
    if (fs.existsSync(dir)) throw new Error(`In ${PROJECT_ROOT} gibt es schon einen Ordner „${n}“. Wähle ihn stattdessen als vorhandenen Ordner.`);
    fs.mkdirSync(dir, { recursive: true });
  } else {
    dir = checkFolder(folder);
  }
  const dup = data.projects.find((x) => samePath(x.path, dir));
  if (dup) throw new Error(`Dieser Ordner ist schon als Projekt „${dup.name}“ in NEXUS.`);
  const i = data.projects.length;
  const p = { id: newProjectId(n), name: n, path: dir,
    color: COLOR.test(color || '') ? color : PALETTE[i % PALETTE.length],
    icon: typeof icon === 'string' && icon && icon.length <= 8 ? icon : ICONS[i % ICONS.length], group: '' };
  data.projects.push(p);
  sortProjects();
  saveData();
  return p;
}

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
function openChat({ projectId, resumeId, mode, model }) {
  const project = projectById(projectId);
  if (!project) throw new Error('Unbekanntes Projekt');
  if (resumeId && !UUID.test(resumeId)) throw new Error('Ungueltige Sitzungs-ID');
  const chatId = nextChatId++;
  const session = new ChatSession({
    cwd: project.path, resumeId, mode, env: cleanEnv(),
    model: model && model !== 'default' ? model : null,
    onEvent: (ev) => {
      if (ev.type === 'nexus-exit') chats.delete(chatId);
      if (ev.type === 'permission') notifyDecision(project, chatId, ev);
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
// Windows-Benachrichtigung (unten rechts), wenn Claude eine Entscheidung braucht und NEXUS nicht im Vordergrund ist.
// Klick holt NEXUS nach vorn und zeigt den betroffenen Chat.
const notes = new Set(); // Referenzen halten, sonst raeumt der GC die Benachrichtigung samt Klick-Handler weg
function showWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
function notifyDecision(project, chatId, ev) {
  if (!win || win.isDestroyed() || win.isFocused() || data.settings.notify === false) return;
  win.flashFrame(true); // Taskleisten-Knopf blinkt, bis NEXUS wieder aktiv ist
  if (!Notification.isSupported()) return;
  const what = ev.displayName || ev.tool || 'ein Werkzeug';
  const n = new Notification({
    title: `NEXUS braucht deine Entscheidung`,
    body: `${project.name}: Claude möchte ${what} verwenden.`,
    icon: path.join(__dirname, 'build', 'icon.png'),
  });
  notes.add(n);
  const done = () => notes.delete(n);
  n.on('click', () => { showWindow(); toUi('focus-chat', chatId); done(); });
  n.on('close', done);
  n.on('show', () => console.log('[notify] angezeigt'));
  n.on('failed', (e, err) => { console.log('[notify] fehlgeschlagen', err); done(); });
  n.show();
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
const webviews = new WebViews(() => win, aiById, (wsId, state) => toUi('web-state', wsId, state), (aiId, status) => toUi('ai-status', aiId, status));

// ---------- Desks ----------
function cleanDesk(desk) {
  if (!desk || typeof desk !== 'object') return null;
  const workspaces = (Array.isArray(desk.workspaces) ? desk.workspaces : []).slice(0, 16)
    .filter((w) => w && WSID.test(w.id) && isWsType(w.type))
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
  projects: publicProjects(), projectRoot: PROJECT_ROOT, sessionMeta: data.sessionMeta, desks: data.desks, slashCommands: data.slashCommands,
  palette: PALETTE, icons: ICONS, ais: publicAis(),
  catalog: Object.entries(CATALOG).map(([id, c]) => ({ id, label: c.label, icon: c.icon, color: c.color, url: c.url })),
  lastProject: data.lastProject || null, settings: data.settings,
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
handle('chat-model', (chatId, model) => chats.get(chatId)?.setModel(model));
handle('chat-close', (chatId) => { chats.get(chatId)?.close(); chats.delete(chatId); });
handle('update-project', (id, patch) => {
  const p = projectById(id);
  if (!p) return;
  if (patch.color && COLOR.test(patch.color)) p.color = patch.color;
  if (typeof patch.icon === 'string' && patch.icon && patch.icon.length <= 8) p.icon = patch.icon;
  if ('name' in patch) p.name = cleanName(patch.name);
  if ('path' in patch) {
    const dir = checkFolder(patch.path);
    const dup = data.projects.find((x) => x !== p && samePath(x.path, dir));
    if (dup) throw new Error(`Dieser Ordner ist schon als Projekt „${dup.name}“ in NEXUS.`);
    p.path = dir;
  }
  sortProjects();
  saveData();
  return publicProjects();
});
handle('project-create', (opts) => { const p = createProject(opts || {}); return { id: p.id, projects: publicProjects() }; });
handle('project-remove', (id) => {
  if (!projectById(id)) return publicProjects();
  data.projects = data.projects.filter((p) => p.id !== id);
  delete data.desks[id];
  if (data.lastProject === id) data.lastProject = null;
  saveData();
  return publicProjects();
});
handle('project-unlisted', () => unlistedFolders());
handle('pick-folder', async (start) => {
  const r = await dialog.showOpenDialog(win, { title: 'Projektordner wählen', properties: ['openDirectory', 'createDirectory'],
    defaultPath: typeof start === 'string' && isDir(start) ? start : PROJECT_ROOT });
  return r.canceled ? null : r.filePaths[0];
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
handle('set-setting', (key, value) => {
  if (SETTINGS[key] && SETTINGS[key](value)) {
    data.settings[key] = value;
    saveData();
    if (key === 'theme') applyTheme();
  }
  return data.settings;
});
// ---------- Meine KIs ----------
handle('ai-status', () => webviews.allStatus(data.ais.map((a) => a.id)));
handle('ai-add', (ids, custom) => {
  for (const id of Array.isArray(ids) ? ids : []) if (CATALOG[id] && !aiById(id)) data.ais.push({ id });
  if (custom && typeof custom === 'object') {
    const ai = customAi(custom.label, custom.url, new Set(data.ais.map((a) => a.id)));
    if (!AI_ID.test(ai.id) || RESERVED.has(ai.id)) throw new Error('Ungültige ID');
    data.ais.push(ai);
  }
  saveData();
  return publicAis();
});
handle('ai-login', (id) => { if (aiById(id)) webviews.openLogin(id); });
handle('ai-logout', (id) => (aiById(id) ? webviews.logout(id) : null));
handle('ai-remove', async (id) => {
  if (!aiById(id)) return publicAis();
  await webviews.logout(id);
  data.ais = data.ais.filter((a) => a.id !== id);
  for (const [pid, d] of Object.entries(data.desks)) data.desks[pid] = cleanDesk(d);
  saveData();
  return publicAis();
});
handle('open-folder', (projectId) => { const p = projectById(projectId); if (p) shell.openPath(p.path); });

on('term-input', (termId, d) => terms.get(termId)?.proc.write(d));
on('term-resize', (termId, cols, rows) => { const t = terms.get(termId); if (t && cols > 0 && rows > 0) t.proc.resize(cols, rows); });
on('term-kill', (termId) => terms.get(termId)?.proc.kill());

on('web-ensure', (wsId, type, url) => { if (WSID.test(wsId) && aiById(type)) webviews.ensure(wsId, type, url); });
on('web-bounds', (wsId, rect) => webviews.setBounds(wsId, rect));
on('web-hide-all', () => webviews.hideAll());
on('web-nav', (wsId, action) => { if (['back', 'reload', 'home', 'external'].includes(action)) webviews.nav(wsId, action); });
on('web-destroy', (wsId) => webviews.destroy(wsId));

// ---------- Fenster ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 920, backgroundColor: bgColor(), title: 'NEXUS', icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  // Keine Menueleiste (File/Edit/View/Window). Kopieren/Einfuegen funktioniert unter Windows auch ohne Menue;
  // Entwicklerwerkzeuge und Zoom bekommen hier eigene Tastenkuerzel.
  win.removeMenu();
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    const wc = win.webContents;
    if (i.key === 'F12' || (i.control && i.shift && i.key.toLowerCase() === 'i')) { wc.toggleDevTools(); e.preventDefault(); }
    else if (i.control && (i.key === '+' || i.key === '=')) { wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 4)); e.preventDefault(); }
    else if (i.control && i.key === '-') { wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -3)); e.preventDefault(); }
    else if (i.control && i.key === '0') { wc.setZoomLevel(0); e.preventDefault(); }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('focus', () => win.flashFrame(false));
  win.webContents.on('console-message', (e) => {
    if (e.level === 'warning' || e.level === 'error') console.log(`[ui:${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
  win.webContents.on('preload-error', (e, p, err) => console.log('[preload-error]', err.message));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

// Eigener App-Name fuer die Taskleiste (sonst gruppiert Windows NEXUS unter "Electron")
app.setAppUserModelId('NEXUS');
app.setName('NEXUS');
// Nur eine NEXUS-Instanz: zweiter Klick auf die Verknuepfung holt das offene Fenster nach vorn
const isTestRun = process.argv.some((a) => a.startsWith('--selftest') || a.startsWith('--userdata='));
const primary = isTestRun || app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on('second-instance', () => { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.focus(); } });

// Windows zeigt Benachrichtigungen nicht installierter Apps nur, wenn eine Startmenue-Verknuepfung dieselbe App-ID traegt.
// Die von create-shortcuts.ps1 angelegten Verknuepfungen bekommen sie hier nachgetragen.
function tagShortcuts() {
  if (process.platform !== 'win32' || (isTestRun && !process.argv.includes('--selftest-notify'))) return;
  const links = [path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'NEXUS.lnk'), path.join(app.getPath('desktop'), 'NEXUS.lnk')];
  for (const lnk of links) {
    try {
      if (fs.existsSync(lnk) && shell.readShortcutLink(lnk).appUserModelId !== 'NEXUS') shell.writeShortcutLink(lnk, 'update', { appUserModelId: 'NEXUS' });
    } catch (e) { console.log('[shortcut]', lnk, e.message); }
  }
}

app.whenReady().then(() => {
  if (!primary) return;
  tagShortcuts();
  applyTheme();
  createWindow();
  // --selftest=<png>: baut im Test-Datenordner einen Desk auf (ohne Nachrichten zu senden), Screenshot, Ende.
  const st = process.argv.find((a) => a.startsWith('--selftest='));
  if (st) {
    win.webContents.once('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 1500));
      const result = await win.webContents.executeJavaScript('window.__nexusSelftest && window.__nexusSelftest()');
      console.log('[selftest]', JSON.stringify(result));
      await new Promise((r) => setTimeout(r, 7000));
      for (const [id, v] of webviews.views) console.log('[selftest] web', id, v.aiId, JSON.stringify(v.view.getBounds()), 'sichtbar:', v.view.getVisible(), '|', v.view.webContents.getTitle());
      // --selftest-theme=<id>: Theme setzen, 2er-Raster mit Chat links; mit --selftest-themepick zusaetzlich die Auswahl offen
      const stTheme = process.argv.find((a) => a.startsWith('--selftest-theme='));
      if (stTheme) {
        await win.webContents.executeJavaScript(`setTheme(${JSON.stringify(stTheme.slice('--selftest-theme='.length))}).then(() => {
          document.querySelector('.lay:nth-child(2)').click(); document.querySelector('.ws-chip').click(); })`);
        await new Promise((r) => setTimeout(r, 3000));
        if (process.argv.includes('--selftest-themepick')) { await win.webContents.executeJavaScript('openSettings()'); await new Promise((r) => setTimeout(r, 400)); }
      }
      if (process.argv.includes('--selftest-pop')) { await win.webContents.executeJavaScript("document.querySelector('.ai-row').click()"); await new Promise((r) => setTimeout(r, 500)); }
      if (process.argv.includes('--selftest-close')) { await win.webContents.executeJavaScript("document.querySelector('.ws-chip .x').click()"); await new Promise((r) => setTimeout(r, 500)); }
      // --selftest-projects=<ordner>: Projekt mit vorhandenem Ordner anlegen, umbenennen, entfernen; danach Editor offen
      const sp = process.argv.find((a) => a.startsWith('--selftest-projects='));
      if (sp) {
        const dir = sp.slice('--selftest-projects='.length);
        const r = await win.webContents.executeJavaScript(`(async () => {
          const out = {};
          const c = await window.nexus.createProject({ name: 'Testprojekt', folder: ${JSON.stringify(dir)} });
          setProjects(c.projects); out.created = c.id; out.afterCreate = state.projects.length;
          try { await window.nexus.createProject({ name: 'Doppelt', folder: ${JSON.stringify(dir)} }); out.dup = 'nicht erkannt'; } catch (e) { out.dup = 'abgelehnt'; }
          try { await window.nexus.createProject({ name: '', folder: ${JSON.stringify(dir)} }); out.empty = 'nicht erkannt'; } catch (e) { out.empty = 'abgelehnt'; }
          setProjects(await window.nexus.updateProject(c.id, { name: 'Umbenannt', icon: '✨' }));
          out.renamed = state.projects.find((p) => p.id === c.id).name;
          renderProjects(); await selectProject(c.id);
          await removeProject(state.projects.find((p) => p.id === c.id));
          out.afterRemove = state.projects.length; out.stillThere = state.projects.some((p) => p.id === c.id);
          out.active = state.project;
          openProjectEditor(null);
          return out;
        })()`);
        console.log('[selftest] projects', JSON.stringify(r), 'ordner noch da:', fs.existsSync(dir));
        await new Promise((res) => setTimeout(res, 800));
      }
      // --selftest-notify: Auto-Modus im ersten Chat waehlen, dann Benachrichtigung wie bei einer Rueckfrage (Fenster gilt als im Hintergrund)
      if (process.argv.includes('--selftest-notify')) {
        const r = await win.webContents.executeJavaScript(`(() => { document.querySelector('.lay').click(); document.querySelector('.ws-chip').click();
          const sel = document.querySelector('.composer select'); sel.value = 'auto'; sel.dispatchEvent(new Event('change'));
          const l = [...live.values()].find((x) => x.view); return { chatId: l.view.chatId, mode: sel.selectedOptions[0].textContent }; })()`);
        await new Promise((res) => setTimeout(res, 2500));
        const models = await win.webContents.executeJavaScript(`[...document.querySelector('.composer .model-sel').options].map((o) => o.textContent)`);
        console.log('[selftest] modelle', JSON.stringify(models));
        console.log('[selftest] modus', r.mode, 'gespeichert:', data.settings.chatMode, 'shortcut-id:', (() => { try { return shell.readShortcutLink(path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'NEXUS.lnk')).appUserModelId; } catch (e) { return e.message; } })());
        win.blur();
        const realFocus = win.isFocused; win.isFocused = () => false;
        notifyDecision({ name: 'Selbsttest' }, r.chatId, { displayName: 'Bash' });
        win.isFocused = realFocus;
        await new Promise((res) => setTimeout(res, 2500));
      }
      // --selftest-thinking: Denk-Anzeige im ersten Chat zeigen (simuliert, es wird nichts gesendet)
      if (process.argv.includes('--selftest-thinking')) {
        await win.webContents.executeJavaScript(`(() => { document.querySelector('.lay').click(); document.querySelector('.ws-chip').click();
          const l = [...live.values()].find((x) => x.view && x.view.setBusy); l.view.setBusy(true);
          l.view.handle({ type: 'raw', data: { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'selftest-1', name: 'WebFetch', input: { url: 'https://example.com' } }] } } }); })()`);
        await new Promise((res) => setTimeout(res, 2600));
      }
      // --selftest-times: Auftrag mit Uhrzeit und Dauer simulieren (es wird nichts gesendet)
      const stTimes = process.argv.find((a) => a.startsWith('--selftest-times'));
      if (stTimes) {
        const chip = Number(stTimes.split('=')[1] || 1);
        const r = await win.webContents.executeJavaScript(`(() => { document.querySelector('.lay').click(); document.querySelector('.ws-chip:nth-child(${chip})').click();
          for (const l of [...live.values()].filter((x) => x.view && x.view.setBusy)) {
            l.view.setBusy(true);
            l.view.handle({ type: 'raw', data: { type: 'assistant', message: { content: [{ type: 'text', text: 'Selbsttest: Antwort.' }] } } });
            l.view.handle({ type: 'raw', data: { type: 'result', subtype: 'success', num_turns: 3, duration_ms: 131000 } });
            l.view.scrollDown();
          }
          return [...document.querySelectorAll('.msg.user .stamp, .note.done')].slice(-4).map((e) => e.textContent); })()`);
        console.log('[selftest] zeiten', JSON.stringify(r));
        await new Promise((res) => setTimeout(res, 800));
      }
      if (process.argv.includes('--selftest-modal')) { await win.webContents.executeJavaScript('openAiManager()'); await new Promise((r) => setTimeout(r, 500)); }
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
