// Datenspeicher von NEXUS (nexus-data.json im Datenordner).
// - Schema-Version in der Datei, Migrationen pro Version
// - atomares Speichern: erst in eine temporaere Datei schreiben, dann umbenennen
// - taegliche Sicherungskopie, die letzten 7 bleiben
// - kaputte Datei: wird beiseitegelegt, die neueste Sicherung wird geladen
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 1;
const FILE = 'nexus-data.json';
const BACKUP_DIR = 'backups';
const KEEP_BACKUPS = 7;

const empty = () => ({ version: SCHEMA_VERSION, projects: [], sessionMeta: {}, desks: {}, slashCommands: [], settings: {}, ais: [] });

// Migrationen: MIGRATIONS[n] hebt eine Datei von Version n auf n+1.
// ctx.catalogIds: IDs der bekannten Web-KIs (fuer "Meine KIs" aus alten Desks)
const MIGRATIONS = {
  // 0 -> 1: Prototyp-Format (ohne Versionsfeld) uebernehmen
  0(d, ctx) {
    d.projects = Array.isArray(d.projects) ? d.projects : [];
    d.sessionMeta = d.sessionMeta && typeof d.sessionMeta === 'object' ? d.sessionMeta : {};
    d.desks = d.desks && typeof d.desks === 'object' ? d.desks : {};
    d.slashCommands = Array.isArray(d.slashCommands) ? d.slashCommands : [];
    d.settings = d.settings && typeof d.settings === 'object' ? d.settings : {};
    // alte Theme-Einstellung (aiTheme hell/dunkel)
    if (!d.settings.theme && d.settings.aiTheme) d.settings.theme = d.settings.aiTheme === 'light' ? 'hell' : 'nacht';
    delete d.settings.aiTheme;
    // "Meine KIs" gab es anfangs nicht: alle KIs uebernehmen, die schon in einem Desk stecken
    if (!Array.isArray(d.ais)) {
      const used = new Set();
      for (const desk of Object.values(d.desks)) for (const w of desk?.workspaces || []) if (ctx.catalogIds.includes(w.type)) used.add(w.type);
      d.ais = [...used].map((id) => ({ id }));
    }
    // Der Prototyp hat immer in Dokumente\Projekt gesucht: als Projektordner uebernehmen
    if (!d.settings.projectRoot && ctx.legacyProjectRoot) d.settings.projectRoot = ctx.legacyProjectRoot;
    return d;
  },
};

// Grundform sicherstellen (auch bei aktueller Version, z. B. von Hand bearbeitete Datei)
function ensureShape(d) {
  const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!Array.isArray(d.projects)) d.projects = [];
  if (!obj(d.sessionMeta)) d.sessionMeta = {};
  if (!obj(d.desks)) d.desks = {};
  if (!Array.isArray(d.slashCommands)) d.slashCommands = [];
  if (!obj(d.settings)) d.settings = {};
  if (!Array.isArray(d.ais)) d.ais = [];
  if (d.window && typeof d.window !== 'object') delete d.window;
  return d;
}

function migrate(raw, ctx = {}) {
  const c = { catalogIds: [], legacyProjectRoot: null, ...ctx };
  const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : empty();
  let v = Number.isInteger(d.version) ? d.version : 0;
  if (v > SCHEMA_VERSION) throw new Error(`newer-schema:${v}`);
  while (v < SCHEMA_VERSION) {
    MIGRATIONS[v](d, c);
    v++;
    d.version = v;
  }
  return ensureShape(d);
}

const today = (now = new Date()) => now.toISOString().slice(0, 10);

class Store {
  // dir: Datenordner; ctx: siehe migrate(); log: Protokollfunktion
  constructor(dir, { ctx = {}, log = () => {}, delay = 150, now = () => new Date() } = {}) {
    this.dir = dir;
    this.file = path.join(dir, FILE);
    this.ctx = ctx;
    this.log = log;
    this.delay = delay;
    this.now = now;
    this.timer = null;
    this.data = null;
    this.recovered = null; // Hinweis, falls eine Sicherung geladen werden musste
  }

  // Laedt die Datei (oder eine Sicherung), migriert sie und legt die Tagessicherung an.
  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    let raw = null;
    let fresh = false;
    if (fs.existsSync(this.file)) {
      try {
        raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      } catch (e) {
        const aside = path.join(this.dir, `nexus-data.corrupt-${Date.now()}.json`);
        fs.renameSync(this.file, aside);
        this.log('[store] Datei kaputt, beiseitegelegt:', aside, e.message);
        raw = this._newestBackup();
        this.recovered = { aside, backup: raw ? raw.__from : null };
        if (raw) delete raw.__from;
      }
    } else {
      fresh = true;
    }
    this.data = migrate(raw || empty(), this.ctx);
    this.fresh = fresh && !raw;
    this.flush();
    this.backup();
    return this.data;
  }

  _backups() {
    const dir = path.join(this.dir, BACKUP_DIR);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => /^nexus-data-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse().map((f) => path.join(dir, f));
  }

  _newestBackup() {
    for (const f of this._backups()) {
      try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); d.__from = f; return d; } catch { /* naechste versuchen */ }
    }
    return null;
  }

  // Eine Sicherung pro Tag; alte ueber KEEP_BACKUPS hinaus werden entfernt (nur eigene Sicherungsdateien).
  backup() {
    const dir = path.join(this.dir, BACKUP_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `nexus-data-${today(this.now())}.json`);
    if (!fs.existsSync(target)) fs.copyFileSync(this.file, target);
    for (const old of this._backups().slice(KEEP_BACKUPS)) fs.rmSync(old, { force: true });
  }

  // Verzoegert speichern (viele kleine Aenderungen hintereinander -> ein Schreibvorgang)
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delay);
  }

  // Sofort speichern, atomar
  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.data) return;
    const tmp = this.file + '.tmp';
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, JSON.stringify(this.data, null, 2));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store, migrate, SCHEMA_VERSION, FILE, KEEP_BACKUPS };
