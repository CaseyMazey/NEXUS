// Automatische Updates (M3): NEXUS fragt GitHub Releases (CaseyMazey/NEXUS) nach einer neueren Version,
// laedt sie im Hintergrund und bietet "Jetzt neu starten" an. Sonst wird beim Beenden installiert.
// Nur in der installierten App aktiv; aus dem Quellcode oder in Tests passiert nichts.
const CHECK_EVERY = 6 * 60 * 60 * 1000; // alle 6 Stunden
const FIRST_CHECK = 15 * 1000; // kurz nach dem Start

// Zustand fuer die Oberflaeche: idle | checking | none | downloading | ready | error | off
class Updater {
  constructor({ enabled, isEnabledSetting, toUi, log = console.log }) {
    this.enabled = enabled;
    this.isEnabledSetting = isEnabledSetting;
    this.toUi = toUi;
    this.log = log;
    this.state = { status: enabled ? 'idle' : 'off' };
    this.au = null;
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    this.toUi('update-state', this.state);
  }

  start() {
    if (!this.enabled) return;
    const { autoUpdater } = require('electron-updater');
    this.au = autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = { info: (m) => this.log('[update]', m), warn: (m) => this.log('[update]', m), error: (m) => this.log('[update]', m), debug: () => {} };
    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking' }));
    autoUpdater.on('update-not-available', () => this.set({ status: 'none', checkedAt: Date.now() }));
    autoUpdater.on('update-available', (info) => this.set({ status: 'downloading', version: info.version, percent: 0 }));
    autoUpdater.on('download-progress', (p) => this.set({ status: 'downloading', percent: Math.round(p.percent || 0) }));
    autoUpdater.on('update-downloaded', (info) => this.set({ status: 'ready', version: info.version }));
    autoUpdater.on('error', (err) => this.set({ status: 'error', error: String(err && err.message || err).slice(0, 300) }));
    setTimeout(() => this.check(false), FIRST_CHECK);
    this.timer = setInterval(() => this.check(false), CHECK_EVERY);
  }

  // manual = vom Nutzer angestossen (auch wenn automatische Updates in den Einstellungen aus sind)
  async check(manual) {
    if (!this.au) return this.state;
    if (!manual && !this.isEnabledSetting()) return this.state;
    if (['downloading', 'ready', 'checking'].includes(this.state.status)) return this.state;
    try { await this.au.checkForUpdates(); } catch (e) { this.set({ status: 'error', error: String(e.message || e).slice(0, 300) }); }
    return this.state;
  }

  // Neu starten und installieren (still, danach startet NEXUS wieder)
  install() {
    if (this.au && this.state.status === 'ready') this.au.quitAndInstall(true, true);
  }
}

module.exports = { Updater };
