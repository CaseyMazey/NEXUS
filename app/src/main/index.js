// NEXUS – Hauptprozess: Datenordner, Daten-Umzug, Fenster, Benachrichtigungen.
// Die Aufrufe aus der Oberflaeche stehen in ipc.js.
const { app, BrowserWindow, shell, nativeTheme, dialog, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { Store } = require('./store');
const { needsMigration, isLocked, migrateLegacy } = require('./legacy');
const { THEMES, normalize } = require('./settings');
const { resolveLang, translator, dict } = require('./i18n');
const { Projects } = require('./projects');
const { Agents, iconPath } = require('./agents');
const { WebViews, CATALOG } = require('./webviews');
const { registerIpc } = require('./ipc');

const APP_ID = 'NEXUS';
const ROOT = path.join(__dirname, '..', '..');

// ---------- Datenordner ----------
// --nexus-data=<ordner>: eigener Datenordner (Tests), sonst %APPDATA%\NEXUS
const dataArg = process.argv.find((a) => a.startsWith('--nexus-data='));
const isTest = !!dataArg;
const DATA_DIR = dataArg ? path.resolve(dataArg.slice('--nexus-data='.length)) : path.join(app.getPath('appData'), APP_ID);
const LEGACY_DIR = path.join(app.getPath('appData'), 'nexus-terminal-test');
app.setPath('userData', DATA_DIR);
app.setAppUserModelId(APP_ID);
app.setName(APP_ID);

// Daten vom Prototyp uebernehmen. Muss vor "ready" passieren, bevor Chromium den Datenordner
// (u. a. "Local State" mit dem Cookie-Schluessel) anlegt.
let migration = null; // { files } | { locked: true } | { error }
if (!isTest && needsMigration(LEGACY_DIR, DATA_DIR)) {
  if (isLocked(LEGACY_DIR)) migration = { locked: true };
  else {
    try { migration = { files: migrateLegacy(LEGACY_DIR, DATA_DIR) }; } catch (e) { migration = { error: e.message }; }
  }
  console.log('[migration]', JSON.stringify(migration));
}

// Nur eine NEXUS-Instanz: zweiter Klick auf die Verknuepfung holt das offene Fenster nach vorn
const primary = isTest || app.requestSingleInstanceLock();
if (!primary) app.quit();

let win = null;
let store = null;
let t = (k) => k;
const toUi = (channel, ...args) => win && !win.isDestroyed() && win.webContents.send(channel, ...args);

// ---------- Daten ----------
const docs = () => { try { return app.getPath('documents'); } catch { return path.join(os.homedir(), 'Documents'); } };
const legacyRoot = path.join(os.homedir(), 'Documents', 'Projekt');
function loadStore() {
  store = new Store(DATA_DIR, {
    log: console.log,
    ctx: { catalogIds: Object.keys(CATALOG), legacyProjectRoot: fs.existsSync(legacyRoot) ? legacyRoot : null },
  });
  store.load();
  store.data.settings = normalize(store.data.settings);
  store.save();
}
// Projektordner: Einstellung, sonst Dokumente
const projectRoot = () => store.data.settings.projectRoot || docs();
const theme = () => THEMES[store.data.settings.theme] || THEMES.nacht;
function applyTheme() {
  nativeTheme.themeSource = theme().mode;
  if (win && !win.isDestroyed()) win.setBackgroundColor(theme().bg);
}

// ---------- Benachrichtigung ----------
// Windows-Meldung (unten rechts), wenn Claude eine Entscheidung braucht und NEXUS nicht im Vordergrund ist.
const notes = new Set(); // Referenzen halten, sonst raeumt der GC die Meldung samt Klick-Handler weg
function showWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
function notifyDecision(project, chatId, ev) {
  if (!win || win.isDestroyed() || win.isFocused() || store.data.settings.notify === false) return;
  win.flashFrame(true);
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: t('notify.title'),
    body: t('notify.body', { project: project.name, tool: ev.displayName || ev.tool || t('notify.aTool') }),
    icon: iconPath,
  });
  notes.add(n);
  const done = () => notes.delete(n);
  n.on('click', () => { showWindow(); toUi('focus-chat', chatId); done(); });
  n.on('close', done);
  n.on('failed', (e, err) => { console.log('[notify] failed', err); done(); });
  n.show();
}

// Windows zeigt Meldungen nicht installierter Apps nur, wenn eine Startmenue-Verknuepfung dieselbe App-ID traegt.
function tagShortcuts() {
  if (process.platform !== 'win32' || isTest) return;
  const links = [path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'NEXUS.lnk'), path.join(app.getPath('desktop'), 'NEXUS.lnk')];
  for (const lnk of links) {
    try {
      if (fs.existsSync(lnk) && shell.readShortcutLink(lnk).appUserModelId !== APP_ID) shell.writeShortcutLink(lnk, 'update', { appUserModelId: APP_ID });
    } catch (e) { console.log('[shortcut]', lnk, e.message); }
  }
}

// ---------- Fenster ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 920, backgroundColor: theme().bg, title: 'NEXUS', icon: path.join(ROOT, 'build', 'icon.ico'),
    webPreferences: { preload: path.join(ROOT, 'src', 'preload', 'index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  // Keine Menueleiste; Entwicklerwerkzeuge und Zoom ueber eigene Tastenkuerzel
  win.removeMenu();
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    const wc = win.webContents;
    if (i.key === 'F12' || (i.control && i.shift && i.key.toLowerCase() === 'i')) { wc.toggleDevTools(); e.preventDefault(); }
    else if (i.control && (i.key === '+' || i.key === '=')) { wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 4)); e.preventDefault(); }
    else if (i.control && i.key === '-') { wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -3)); e.preventDefault(); }
    else if (i.control && i.key === '0') { wc.setZoomLevel(0); e.preventDefault(); }
  });
  win.loadFile(path.join(ROOT, 'src', 'renderer', 'index.html'));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('focus', () => win.flashFrame(false));
  win.webContents.on('console-message', (e) => {
    if (e.level === 'warning' || e.level === 'error') console.log(`[ui:${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
  win.webContents.on('preload-error', (e, p, err) => console.log('[preload-error]', err.message));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

app.on('second-instance', () => showWindow());

app.whenReady().then(async () => {
  if (!primary) return;
  const sysLocale = app.getLocale();
  // Alter NEXUS laeuft noch: Umzug geht erst, wenn er geschlossen ist
  if (migration?.locked || migration?.error) {
    const tt = translator(resolveLang('auto', sysLocale));
    const r = await dialog.showMessageBox({
      type: 'info', title: 'NEXUS',
      message: tt(migration.locked ? 'migrate.lockedMsg' : 'migrate.errorMsg'),
      detail: tt(migration.locked ? 'migrate.lockedDetail' : 'migrate.errorDetail', { dir: LEGACY_DIR, error: migration.error || '' }),
      buttons: [tt('migrate.retry'), tt('migrate.quit')], defaultId: 0, cancelId: 1,
    });
    if (r.response === 0) app.relaunch();
    app.exit(0);
    return;
  }
  loadStore();
  const lang = resolveLang(store.data.settings.language, sysLocale);
  t = translator(lang);
  const projects = new Projects(store, projectRoot, lang);
  const agents = new Agents({
    projectById: (id) => projects.byId(id), toUi, t,
    onPermission: notifyDecision,
    onSlashCommands: (list) => { store.data.slashCommands = list; store.save(); },
  });
  const aiById = (id) => store.data.ais.find((a) => a.id === id) || null;
  const webviews = new WebViews(() => win, aiById, (wsId, s) => toUi('web-state', wsId, s), (aiId, s) => toUi('ai-status', aiId, s), t);
  registerIpc({
    getWin: () => win, store, projects, agents, webviews, aiById, t, applyTheme, projectRoot,
    lang, strings: dict(lang), migrated: migration && migration.files ? { from: LEGACY_DIR } : null,
    relaunch: () => { store.flush(); app.relaunch(); app.quit(); },
  });
  tagShortcuts();
  applyTheme();
  createWindow();
  app.on('before-quit', () => { agents.closeAll(); store.flush(); });
  app.on('window-all-closed', () => { agents.closeAll(); store.flush(); app.quit(); });
});
