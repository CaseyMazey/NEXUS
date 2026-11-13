// Web-Workspaces (Claude, ChatGPT, Gemini) als WebContentsView – uebernommen aus Phase 0 (embed-test).
// Regeln: eigene Partition je Anbieter, Sandbox, kein Preload, keine eingeschleusten Skripte,
// nur passive Beobachtung (URL/Titel), Navigation nur zu erlaubten Hosts.
const { WebContentsView, session, shell } = require('electron');

const PROVIDERS = {
  claude: {
    label: 'Claude', url: 'https://claude.ai/new', partition: 'persist:nexus-claude',
    hosts: ['claude.ai', 'anthropic.com', 'claude.com', 'challenges.cloudflare.com', 'accounts.google.com', 'appleid.apple.com'],
  },
  chatgpt: {
    label: 'ChatGPT', url: 'https://chatgpt.com/', partition: 'persist:nexus-chatgpt',
    hosts: ['chatgpt.com', 'openai.com', 'oaistatic.com', 'oaiusercontent.com', 'challenges.cloudflare.com',
      'accounts.google.com', 'accounts.youtube.com', 'login.live.com', 'login.microsoftonline.com', 'appleid.apple.com'],
  },
  gemini: {
    label: 'Gemini', url: 'https://gemini.google.com/app', partition: 'persist:nexus-gemini',
    hosts: ['gemini.google.com', 'google.com', 'gstatic.com', 'googleusercontent.com', 'accounts.google.com', 'accounts.youtube.com'],
  },
};

function hostAllowed(provider, raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  return provider.hosts.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
}
// Nur Ursprung + Pfad speichern (Query/Fragment koennen Tokens enthalten).
function safeUrl(raw) {
  try { const u = new URL(raw); return u.origin + u.pathname; } catch { return ''; }
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
  constructor(getWin, emit) {
    this.getWin = getWin;
    this.emit = emit; // (wsId, state)
    this.views = new Map(); // wsId -> { view, type }
  }

  ensure(wsId, type, url) {
    const provider = PROVIDERS[type];
    if (!provider) throw new Error('Unbekannter Anbieter');
    if (this.views.has(wsId)) return;
    const ses = session.fromPartition(provider.partition);
    hardenSession(ses);
    const view = new WebContentsView({
      webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false, safeDialogs: true },
    });
    const wc = view.webContents;
    const send = () => this.emit(wsId, { url: safeUrl(wc.getURL()), title: wc.getTitle(), loading: wc.isLoading() });
    wc.on('will-navigate', (e, u) => { if (!hostAllowed(provider, u)) { e.preventDefault(); shell.openExternal(u); } });
    wc.on('will-redirect', (e, u) => { if (!hostAllowed(provider, u)) e.preventDefault(); });
    wc.setWindowOpenHandler(({ url: u }) => {
      if (hostAllowed(provider, u)) {
        return { action: 'allow', overrideBrowserWindowOptions: { parent: this.getWin(), width: 520, height: 720,
          webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } } };
      }
      if (/^https:\/\//.test(u)) shell.openExternal(u);
      return { action: 'deny' };
    });
    for (const ev of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading']) wc.on(ev, send);
    wc.on('did-fail-load', (e, code, desc, u, main) => { if (main) this.emit(wsId, { error: `${desc} (${code})` }); });
    wc.on('render-process-gone', (e, d) => this.emit(wsId, { error: 'Absturz: ' + d.reason }));
    view.setVisible(false);
    this.getWin().contentView.addChildView(view);
    this.views.set(wsId, { view, type });
    const start = url && hostAllowed(provider, url) ? url : provider.url;
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
    const provider = PROVIDERS[v.type];
    if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    if (action === 'reload') wc.reload();
    if (action === 'home') wc.loadURL(provider.url);
    if (action === 'external') shell.openExternal(wc.getURL().startsWith('https://') ? wc.getURL() : provider.url);
  }

  destroy(wsId) {
    const v = this.views.get(wsId);
    if (!v) return;
    try { this.getWin().contentView.removeChildView(v.view); } catch {}
    v.view.webContents.close();
    this.views.delete(wsId);
  }
}

module.exports = { WebViews, PROVIDERS };
