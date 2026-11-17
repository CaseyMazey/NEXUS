// Web-KIs (Claude, ChatGPT, Gemini, eigene …) als WebContentsView – uebernommen aus Phase 0 (embed-test).
// Regeln: eigene Partition je KI, Sandbox, kein Preload, keine eingeschleusten Skripte,
// nur passive Beobachtung (URL/Titel, ob ein Anmelde-Cookie existiert – nie dessen Wert),
// Navigation nur zu erlaubten Hosts.
const { WebContentsView, BrowserWindow, session, shell, dialog, nativeTheme } = require('electron');
const { UserError } = require('./validate');
const { AUTH_HOSTS, hostAllowed, isAuthUrl, safeUrl } = require('./hosts');

// Diagnose-Protokoll (ohne Query-Strings/Cookies): Zeit seit Start des jeweiligen Fensters.
const T0 = Date.now();
const short = (raw) => { try { const u = new URL(raw); return u.hostname + u.pathname.slice(0, 60); } catch { return String(raw).slice(0, 60); } };
function trace(wc, tag, provider) {
  const start = Date.now();
  const log = (...a) => console.log(`[net ${((Date.now() - T0) / 1000).toFixed(1)}s +${((Date.now() - start) / 1000).toFixed(1)}s] ${tag}/${provider.id}`, ...a);
  const pending = new Map();
  wc.on('did-start-navigation', (d) => { if (d.isMainFrame && !d.isSameDocument) { pending.set(d.url, Date.now()); log('→ lädt', short(d.url)); } });
  wc.on('did-navigate', (e, url, code) => {
    const t = pending.get(url);
    log('✓ geladen', short(url), 'HTTP', code, t ? `in ${((Date.now() - t) / 1000).toFixed(1)}s` : '');
  });
  wc.on('did-stop-loading', () => log('■ fertig', short(wc.getURL())));
  wc.on('did-fail-load', (e, code, desc, url, main) => { if (main) log('✗ Fehler', desc, short(url)); });
  wc.on('did-create-window', (w, d) => log('□ Popup', short(d.url)));
  return log;
}

// Katalog bekannter KIs. id = Partitionsname (persist:nexus-<id>), bleibt stabil.
// authCookie: woran NEXUS erkennt, dass man angemeldet ist (nur Existenz, nie der Wert).
const CATALOG = {
  claude: {
    label: 'Claude', icon: '💬', color: '#c96442', url: 'https://claude.ai/new',
    hosts: ['claude.ai', 'anthropic.com', 'claude.com'],
    authCookie: { domain: 'claude.ai', names: ['sessionKey'] },
  },
  chatgpt: {
    label: 'ChatGPT', icon: '🟢', color: '#10a37f', url: 'https://chatgpt.com/',
    hosts: ['chatgpt.com', 'openai.com', 'oaistatic.com', 'oaiusercontent.com'],
    authCookie: { domain: 'chatgpt.com', names: ['__Secure-next-auth.session-token'] },
  },
  gemini: {
    label: 'Gemini', icon: '✦', color: '#4285f4', url: 'https://gemini.google.com/app',
    hosts: ['gemini.google.com', 'google.com', 'gstatic.com', 'googleusercontent.com'],
    authCookie: { domain: 'google.com', names: ['__Secure-1PSID', 'SID'] },
  },
  perplexity: {
    label: 'Perplexity', icon: '🔎', color: '#20b8cd', url: 'https://www.perplexity.ai/',
    hosts: ['perplexity.ai'],
    authCookie: { domain: 'perplexity.ai', names: ['__Secure-next-auth.session-token'] },
  },
  lechat: {
    label: 'Le Chat (Mistral)', icon: '🐈', color: '#fa520f', url: 'https://chat.mistral.ai/chat',
    hosts: ['mistral.ai'], authCookie: null,
  },
  copilot: {
    label: 'Microsoft Copilot', icon: '🪁', color: '#3b82f6', url: 'https://copilot.microsoft.com/',
    hosts: ['copilot.microsoft.com', 'microsoft.com', 'live.com', 'microsoftonline.com', 'bing.com', 'msauth.net', 'msftauth.net'],
    authCookie: null,
  },
  deepseek: {
    label: 'DeepSeek', icon: '🐋', color: '#4d6bfe', url: 'https://chat.deepseek.com/',
    hosts: ['deepseek.com'], authCookie: null,
  },
};

const AI_ID = /^[a-z0-9-]{2,30}$/;
const RESERVED = new Set(['claude-code', 'claude-code-term']);

// Eigene KI aus Name + Adresse bauen. Erlaubt: die Domain der Adresse (ohne Subdomain) + Anmelde-Hosts.
function customAi(label, rawUrl, existingIds) {
  let u;
  try { u = new URL(String(rawUrl).trim()); } catch { throw new UserError('err.badUrl'); }
  if (u.protocol !== 'https:') throw new UserError('err.httpsOnly');
  if (/^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/.test(u.hostname)) throw new UserError('err.publicOnly');
  const name = String(label || '').trim().slice(0, 40) || u.hostname;
  const parts = u.hostname.split('.');
  const domain = parts.slice(-2).join('.');
  let id;
  do { id = 'custom-' + Math.random().toString(36).slice(2, 8); } while (existingIds.has(id));
  return { id, label: name, icon: '🌐', color: '#94a3b8', url: u.origin + u.pathname, hosts: [domain], custom: true };
}

// Gespeicherten Eintrag (nexus-data.json) in vollstaendigen Anbieter umwandeln.
function resolve(ai) {
  const base = CATALOG[ai.id];
  const p = base ? { ...base, id: ai.id } : { ...ai };
  p.hosts = [...new Set([...(p.hosts || []), ...AUTH_HOSTS])];
  p.partition = 'persist:nexus-' + ai.id;
  return p;
}

const hardened = new Set();
function hardenSession(ses) {
  if (hardened.has(ses)) return;
  hardened.add(ses);
  const allowed = new Set(['clipboard-sanitized-write', 'fullscreen', 'persistent-storage']);
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(allowed.has(permission)));
  ses.setPermissionCheckHandler((wc, permission) => allowed.has(permission));
  ses.on('will-download', (e) => e.preventDefault());
}

class WebViews {
  // getAi(id) -> gespeicherter Eintrag oder null; emit(wsId, state); emitStatus(aiId, status)
  constructor(getWin, getAi, emit, emitStatus, t) {
    this.t = t;
    this.getWin = getWin;
    this.getAi = getAi;
    this.emit = emit;
    this.emitStatus = emitStatus;
    this.views = new Map(); // wsId -> { view, aiId }
    this.loginWins = new Map(); // aiId -> BrowserWindow
    this.watched = new Set(); // aiIds mit Cookie-Beobachtung
    this.status = new Map(); // aiId -> 'in' | 'out' | 'unknown'
  }

  provider(aiId) {
    const ai = this.getAi(aiId);
    if (!ai) throw new UserError('err.aiUnknown');
    return resolve(ai);
  }

  sessionFor(provider) {
    const ses = session.fromPartition(provider.partition);
    hardenSession(ses);
    if (!this.watched.has(provider.id)) {
      this.watched.add(provider.id);
      let t;
      ses.cookies.on('changed', () => { clearTimeout(t); t = setTimeout(() => this.refreshStatus(provider.id), 700); });
    }
    return ses;
  }

  // Navigationsregeln fuer Ansicht und Anmeldefenster
  guard(wc, provider, ses, log = () => {}) {
    wc.on('will-navigate', (e, u) => { if (!hostAllowed(provider, u)) { log('⛔ Navigation blockiert → Browser', short(u)); e.preventDefault(); shell.openExternal(u); } });
    wc.on('will-redirect', (e, u) => { if (!hostAllowed(provider, u)) { log('⛔ Weiterleitung blockiert', short(u)); e.preventDefault(); } });
    wc.setWindowOpenHandler(({ url: u }) => {
      log(hostAllowed(provider, u) ? '□ Popup erlaubt' : '⛔ Popup → Browser', short(u));
      if (hostAllowed(provider, u)) {
        // Popup gehoert zum oeffnenden Fenster (sonst landet es z. B. hinter dem Anmeldefenster).
        return { action: 'allow', overrideBrowserWindowOptions: { parent: BrowserWindow.fromWebContents(wc) || this.getWin(), width: 520, height: 720, autoHideMenuBar: true,
          webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } } };
      }
      if (/^https:\/\//.test(u)) shell.openExternal(u);
      return { action: 'deny' };
    });
    // Popups bekommen dieselben Regeln
    wc.on('did-create-window', (child) => {
      this.guard(child.webContents, provider, ses, (...a) => log('  [Popup]', ...a));
      child.webContents.on('did-navigate', (e, url) => log('  [Popup] ✓', short(url)));
      child.focus();
    });
  }

  // Zertifikatsfehler verstaendlich melden (NEXUS umgeht die Pruefung nie).
  watchCertErrors(wc, onError) {
    wc.on('certificate-error', (e, url, error, cert) => {
      let host = '';
      try { host = new URL(url).hostname; } catch { /* kein Host */ }
      onError({ host, error, issuer: (cert && cert.issuerName) || '?' });
    });
  }

  // ---------- Anmeldestatus ----------
  async checkStatus(aiId) {
    let provider;
    try { provider = this.provider(aiId); } catch { return 'out'; }
    const ses = this.sessionFor(provider);
    const now = Date.now() / 1000;
    if (provider.authCookie) {
      const list = await ses.cookies.get({ domain: provider.authCookie.domain });
      const ok = list.some((c) => provider.authCookie.names.some((n) => c.name === n || c.name.startsWith(n + '.'))
        && (!c.expirationDate || c.expirationDate > now));
      return ok ? 'in' : 'out';
    }
    // Ohne bekanntes Cookie: "eingerichtet", sobald der Anbieter ueberhaupt dauerhafte Cookies gesetzt hat.
    const any = await ses.cookies.get({});
    return any.some((c) => !c.session && provider.hosts.slice(0, 1).some((h) => (c.domain || '').replace(/^\./, '').endsWith(h))) ? 'unknown' : 'out';
  }

  async refreshStatus(aiId) {
    const before = this.status.get(aiId);
    const now = await this.checkStatus(aiId);
    this.status.set(aiId, now);
    if (now !== before) {
      this.emitStatus(aiId, now);
      // Frisch angemeldet: offene Ansichten dieser KI, die auf einer Login-Seite haengen, neu laden.
      if (now === 'in' && before === 'out') {
        const provider = this.provider(aiId);
        for (const v of this.views.values()) {
          if (v.aiId !== aiId) continue;
          const wc = v.view.webContents;
          if (isAuthUrl(wc.getURL()) || !wc.getURL()) wc.loadURL(provider.url);
          else wc.reload();
        }
      }
    }
    return now;
  }

  async allStatus(ids) {
    const out = {};
    for (const id of ids) out[id] = await this.refreshStatus(id);
    return out;
  }

  // Eigenes Fenster zum Anmelden (gleiche Partition wie die Workspaces).
  openLogin(aiId) {
    const provider = this.provider(aiId);
    const existing = this.loginWins.get(aiId);
    if (existing && !existing.isDestroyed()) { existing.focus(); return; }
    const ses = this.sessionFor(provider);
    const w = new BrowserWindow({
      parent: this.getWin(), width: 980, height: 820, title: this.t('login.title', { ai: provider.label }), backgroundColor: nativeTheme.shouldUseDarkColors ? '#111216' : '#f5f6f8',
      autoHideMenuBar: true,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false, safeDialogs: true },
    });
    w.setMenuBarVisibility(false);
    const log = trace(w.webContents, 'login', provider);
    const tp = Date.now();
    ses.resolveProxy(provider.url).then((p) => log('Proxy-Auflösung', p, `${Date.now() - tp} ms`));
    this.guard(w.webContents, provider, ses, log);
    let warned = false;
    this.watchCertErrors(w.webContents, ({ host, error, issuer }) => {
      log('✗ Zertifikat abgefangen', host, error, 'Aussteller:', issuer);
      if (warned || w.isDestroyed()) return;
      warned = true;
      dialog.showMessageBox(w, {
        type: 'warning', title: this.t('login.blockedTitle'),
        message: this.t('login.blockedMsg', { host }),
        detail: this.t('login.blockedDetail', { issuer, error }),
        buttons: ['OK'],
      });
    });
    w.webContents.on('page-title-updated', (e, t) => { e.preventDefault(); w.setTitle(this.t('login.windowTitle', { ai: provider.label, page: t })); });
    w.on('closed', () => { this.loginWins.delete(aiId); this.refreshStatus(aiId); });
    this.loginWins.set(aiId, w);
    w.loadURL(provider.url);
  }

  // Abmelden = alle Daten dieser KI in NEXUS loeschen (Cookies, Speicher, Cache).
  async logout(aiId) {
    const provider = this.provider(aiId);
    const ses = this.sessionFor(provider);
    for (const [wsId, v] of this.views) if (v.aiId === aiId) this.destroy(wsId);
    await ses.clearStorageData();
    await ses.clearCache();
    return this.refreshStatus(aiId);
  }

  // ---------- Workspaces ----------
  ensure(wsId, aiId, url) {
    const provider = this.provider(aiId);
    if (this.views.has(wsId)) return;
    const ses = this.sessionFor(provider);
    const view = new WebContentsView({
      webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false, safeDialogs: true },
    });
    const wc = view.webContents;
    const send = () => {
      const cur = wc.getURL();
      // Login-Seiten und fremde Hosts nicht als Chat-Adresse melden.
      const keep = cur && hostAllowed(provider, cur) && !isAuthUrl(cur);
      this.emit(wsId, { url: keep ? safeUrl(cur) : undefined, title: wc.getTitle(), loading: wc.isLoading(), auth: isAuthUrl(cur) });
    };
    this.guard(wc, provider, ses, trace(wc, 'ws', provider));
    this.watchCertErrors(wc, ({ host, issuer }) => this.emit(wsId, { error: this.t('web.intercepted', { host, issuer }) }));
    for (const ev of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading']) wc.on(ev, send);
    wc.on('did-fail-load', (e, code, desc, u, main) => { if (main) this.emit(wsId, { error: `${desc} (${code})` }); });
    wc.on('render-process-gone', (e, d) => this.emit(wsId, { error: this.t('web.crashed', { reason: d.reason }) }));
    view.setVisible(false);
    this.getWin().contentView.addChildView(view);
    this.views.set(wsId, { view, aiId });
    const start = url && hostAllowed(provider, url) && !isAuthUrl(url) ? url : provider.url;
    wc.loadURL(start);
  }

  setBounds(wsId, rect) {
    const v = this.views.get(wsId);
    if (!v) return;
    if (!rect || rect.width < 10 || rect.height < 10) { v.view.setVisible(false); return; }
    v.view.setBounds({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) });
    v.view.setVisible(true);
  }

  hideAll() { for (const v of this.views.values()) v.view.setVisible(false); }

  nav(wsId, action) {
    const v = this.views.get(wsId);
    if (!v) return;
    const wc = v.view.webContents;
    const provider = this.provider(v.aiId);
    if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    if (action === 'reload') wc.reload();
    if (action === 'home') wc.loadURL(provider.url);
    if (action === 'external') shell.openExternal(wc.getURL().startsWith('https://') ? wc.getURL() : provider.url);
  }

  destroy(wsId) {
    const v = this.views.get(wsId);
    if (!v) return;
    try { this.getWin().contentView.removeChildView(v.view); } catch { /* schon entfernt */ }
    v.view.webContents.close();
    this.views.delete(wsId);
  }
}

module.exports = { WebViews, CATALOG, AI_ID, RESERVED, customAi };
