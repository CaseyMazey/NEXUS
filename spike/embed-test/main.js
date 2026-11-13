// NEXUS Phase 0 – Einbettungstest
// Beobachtet nur passiv (Navigations- und Lade-Ereignisse). Es wird kein Skript in
// Anbieterseiten eingeschleust und nichts automatisch bedient.

const { app, BrowserWindow, WebContentsView, session, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { PROVIDERS, hostAllowed } = require('./providers');

const CLEAN_UA = process.argv.includes('--clean-ua');
const TOOLBAR_HEIGHT = 48;

// Eigener Datenordner, damit der Test nichts anderes beruehrt.
app.setPath('userData', path.join(app.getPath('appData'), 'nexus-embed-test'));
const LOG_FILE = path.join(app.getPath('userData'), 'phase0-log.jsonl');

function log(event, data = {}) {
  const entry = { t: new Date().toISOString(), event, ...data };
  const line = JSON.stringify(entry);
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {}
}

// URLs ohne Query/Fragment protokollieren (koennen Tokens enthalten).
function safeUrl(raw) {
  try {
    const u = new URL(raw);
    return u.origin + u.pathname;
  } catch {
    return String(raw).slice(0, 80);
  }
}

let win;
const views = {};
let active = null;

function cleanUserAgent(ua) {
  // Entfernt nur die App- und Electron-Kennung, der Chromium-Teil bleibt echt.
  return ua.replace(/\s?nexus-embed-test\/\S+/i, '').replace(/\s?Electron\/\S+/, '');
}

function hardenSession(key, ses) {
  if (CLEAN_UA) ses.setUserAgent(cleanUserAgent(ses.getUserAgent()));

  // Berechtigungen: standardmaessig ablehnen, Anfragen protokollieren.
  const allowedPermissions = new Set(['clipboard-sanitized-write', 'fullscreen']);
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const ok = allowedPermissions.has(permission);
    log('permission-request', { provider: key, permission, granted: ok, origin: safeUrl(details.requestingUrl || '') });
    callback(ok);
  });
  ses.setPermissionCheckHandler((wc, permission) => allowedPermissions.has(permission));

  // Downloads nicht still speichern.
  ses.on('will-download', (e, item) => {
    log('download-blocked', { provider: key, file: item.getFilename() });
    e.preventDefault();
  });
}

function sendState(key, extra = {}) {
  if (!win || win.isDestroyed()) return;
  const wc = views[key]?.webContents;
  win.webContents.send('state', {
    key,
    active,
    url: wc ? safeUrl(wc.getURL()) : '',
    title: wc ? wc.getTitle() : '',
    loading: wc ? wc.isLoading() : false,
    ...extra,
  });
}

function createProviderView(key) {
  const provider = PROVIDERS[key];
  const ses = session.fromPartition(provider.partition);
  hardenSession(key, ses);

  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      safeDialogs: true,
    },
  });
  const wc = view.webContents;

  wc.on('will-navigate', (e, url) => {
    if (!hostAllowed(provider, url)) {
      e.preventDefault();
      log('navigation-external', { provider: key, url: safeUrl(url) });
      shell.openExternal(url);
    }
  });
  wc.on('will-redirect', (e, url) => {
    if (!hostAllowed(provider, url)) {
      e.preventDefault();
      log('redirect-blocked', { provider: key, url: safeUrl(url) });
    }
  });

  // Popups: Login-Popups (z. B. Google) im selben Sitzungsbereich erlauben, Rest extern.
  wc.setWindowOpenHandler(({ url }) => {
    if (hostAllowed(provider, url)) {
      log('popup-allowed', { provider: key, url: safeUrl(url) });
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          parent: win,
          width: 520,
          height: 720,
          webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false },
        },
      };
    }
    log('popup-external', { provider: key, url: safeUrl(url) });
    shell.openExternal(url);
    return { action: 'deny' };
  });

  wc.on('did-start-loading', () => sendState(key));
  wc.on('did-stop-loading', () => sendState(key));
  wc.on('page-title-updated', () => sendState(key));
  wc.on('did-navigate', (e, url, code, status) => {
    log('did-navigate', { provider: key, url: safeUrl(url), code, status });
    sendState(key);
  });
  wc.on('did-navigate-in-page', (e, url) => sendState(key));
  wc.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    if (!isMainFrame) return;
    log('did-fail-load', { provider: key, code, desc, url: safeUrl(url) });
    sendState(key, { error: `${desc} (${code})` });
  });
  wc.on('did-finish-load', () => log('did-finish-load', { provider: key, url: safeUrl(wc.getURL()), title: wc.getTitle() }));
  wc.on('render-process-gone', (e, details) => {
    log('render-process-gone', { provider: key, ...details });
    sendState(key, { error: 'Renderer abgestuerzt: ' + details.reason });
  });
  wc.on('unresponsive', () => log('unresponsive', { provider: key }));

  views[key] = view;
  return view;
}

function layout() {
  if (!win || !active) return;
  const [w, h] = win.getContentSize();
  for (const [key, view] of Object.entries(views)) {
    view.setVisible(key === active);
    if (key === active) view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: w, height: h - TOOLBAR_HEIGHT });
  }
}

function activate(key) {
  if (!PROVIDERS[key]) return;
  if (!views[key]) {
    const view = createProviderView(key);
    win.contentView.addChildView(view);
    view.webContents.loadURL(PROVIDERS[key].url);
    log('provider-load', { provider: key, url: PROVIDERS[key].url });
  }
  active = key;
  layout();
  sendState(key);
}

async function logStoredSessions() {
  // Nur Anzahl und Namen der Cookies, keine Werte.
  for (const [key, p] of Object.entries(PROVIDERS)) {
    const cookies = await session.fromPartition(p.partition).cookies.get({});
    const persistent = cookies.filter((c) => !c.session);
    log('stored-cookies', {
      provider: key,
      total: cookies.length,
      persistent: persistent.length,
      names: [...new Set(persistent.map((c) => c.name))].slice(0, 40),
    });
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'NEXUS – Phase 0 Einbettungstest',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'toolbar.html'));
  win.on('resize', layout);
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('init', {
      providers: Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, p.label])),
      cleanUa: CLEAN_UA,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
    });
    // --load-all: beide Anbieter beim Start laden (fuer den Ladetest).
    if (process.argv.includes('--load-all')) activate('chatgpt');
    activate('claude');
  });
}

// Nur IPC von der eigenen Toolbar annehmen.
function fromToolbar(e) {
  return win && e.sender === win.webContents;
}
ipcMain.on('activate', (e, key) => fromToolbar(e) && activate(key));
ipcMain.on('reload', (e) => fromToolbar(e) && active && views[active].webContents.reload());
ipcMain.on('home', (e) => fromToolbar(e) && active && views[active].webContents.loadURL(PROVIDERS[active].url));
ipcMain.on('open-external', (e) => fromToolbar(e) && active && shell.openExternal(PROVIDERS[active].url));
ipcMain.on('relaunch', (e) => {
  if (!fromToolbar(e)) return;
  log('relaunch-requested', { cleanUa: CLEAN_UA });
  app.relaunch();
  app.quit();
});
ipcMain.on('clear-session', async (e) => {
  if (!fromToolbar(e) || !active) return;
  await session.fromPartition(PROVIDERS[active].partition).clearStorageData();
  log('session-cleared', { provider: active });
  views[active].webContents.loadURL(PROVIDERS[active].url);
});

// Globale Absicherung: keine <webview>-Tags, keine fremden Fenster ohne Handler.
app.on('web-contents-created', (e, contents) => {
  contents.on('will-attach-webview', (ev) => ev.preventDefault());
});

app.whenReady().then(async () => {
  log('app-start', {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    cleanUa: CLEAN_UA,
    defaultUa: CLEAN_UA ? 'clean' : 'electron-default',
  });
  await logStoredSessions();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => log('app-quit'));
