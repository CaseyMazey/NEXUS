// Projekte: NEXUS fuehrt eine eigene Liste. Ordner auf der Platte werden nie geloescht.
const fs = require('node:fs');
const path = require('node:path');
const { UserError, COLOR, cleanName, folderName, newProjectId, samePath, isIcon } = require('./validate');

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#a855f7', '#84cc16'];
const ICONS = ['🧭', '🏡', '🧠', '🔥', '📚', '🛠️', '🎮', '🌐', '🗂️', '✨'];

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

function checkFolder(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p) || !isDir(p)) throw new UserError('err.folderMissing');
  return path.resolve(p);
}

class Projects {
  // store: Store; root(): Projektordner fuer neue Projekte; collator: Sortierung nach Sprache
  constructor(store, root, locale = 'de') {
    this.store = store;
    this.root = root;
    this.locale = locale;
  }

  get list() { return this.store.data.projects; }
  byId(id) { return this.list.find((p) => p.id === id); }
  sort() { this.list.sort((a, b) => a.name.localeCompare(b.name, this.locale, { numeric: true })); }
  public() { return this.list.map((p) => ({ ...p, missing: !isDir(p.path) })); }

  // Ordner im Projektordner, die noch nicht in NEXUS sind
  unlisted() {
    const root = this.root();
    if (!isDir(root)) return [];
    return fs.readdirSync(root).filter((n) => !n.startsWith('.') && isDir(path.join(root, n)))
      .map((n) => path.join(root, n)).filter((p) => !this.list.some((x) => samePath(x.path, p)))
      .sort((a, b) => a.localeCompare(b, this.locale, { numeric: true }));
  }

  create({ name, folder, newFolder, icon, color }) {
    const n = cleanName(name);
    let dir;
    if (newFolder) {
      const root = this.root();
      dir = path.join(root, folderName(n));
      if (fs.existsSync(dir)) throw new UserError('err.folderExists', { root, name: n });
      fs.mkdirSync(dir, { recursive: true });
    } else {
      dir = checkFolder(folder);
    }
    const dup = this.list.find((x) => samePath(x.path, dir));
    if (dup) throw new UserError('err.folderTaken', { name: dup.name });
    const i = this.list.length;
    const p = {
      id: newProjectId(n, (id) => !!this.byId(id)), name: n, path: dir,
      color: COLOR.test(color || '') ? color : PALETTE[i % PALETTE.length],
      icon: isIcon(icon) ? icon : ICONS[i % ICONS.length], group: '',
    };
    this.list.push(p);
    this.sort();
    this.store.save();
    return p;
  }

  update(id, patch = {}) {
    const p = this.byId(id);
    if (!p) return;
    if (patch.color && COLOR.test(patch.color)) p.color = patch.color;
    if (isIcon(patch.icon)) p.icon = patch.icon;
    if ('name' in patch) p.name = cleanName(patch.name);
    if ('path' in patch) {
      const dir = checkFolder(patch.path);
      const dup = this.list.find((x) => x !== p && samePath(x.path, dir));
      if (dup) throw new UserError('err.folderTaken', { name: dup.name });
      p.path = dir;
    }
    this.sort();
    this.store.save();
  }

  // Nur aus NEXUS entfernen: Desk weg, Ordner und Sitzungen bleiben
  remove(id) {
    const d = this.store.data;
    if (!this.byId(id)) return;
    d.projects = d.projects.filter((p) => p.id !== id);
    delete d.desks[id];
    if (d.lastProject === id) d.lastProject = null;
    this.store.save();
  }
}

module.exports = { Projects, PALETTE, ICONS, isDir, checkFolder };
