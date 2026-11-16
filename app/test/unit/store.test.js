const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store, migrate, SCHEMA_VERSION, KEEP_BACKUPS } = require('../../src/main/store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-store-'));

test('migrate: Prototyp-Daten ohne Version werden auf die aktuelle Version gehoben', () => {
  const old = {
    projects: [{ id: 'a', name: 'A', path: 'C:\\x' }],
    desks: { a: { workspaces: [{ id: 'ws-1', type: 'claude' }, { id: 'ws-2', type: 'claude-code' }] } },
    settings: { aiTheme: 'light' },
  };
  const d = migrate(old, { catalogIds: ['claude', 'chatgpt'], legacyProjectRoot: 'C:\\Users\\x\\Documents\\Projekt' });
  assert.equal(d.version, SCHEMA_VERSION);
  assert.equal(d.settings.theme, 'hell');
  assert.equal(d.settings.aiTheme, undefined);
  assert.deepEqual(d.ais, [{ id: 'claude' }]);
  assert.deepEqual(d.sessionMeta, {});
  assert.deepEqual(d.slashCommands, []);
  assert.equal(d.settings.projectRoot, 'C:\\Users\\x\\Documents\\Projekt');
});

test('migrate: vorhandene KIs und Einstellungen bleiben erhalten', () => {
  const d = migrate({ ais: [{ id: 'gemini' }], settings: { theme: 'retro', projectRoot: 'D:\\p' }, desks: {} }, { catalogIds: ['claude'], legacyProjectRoot: 'C:\\x' });
  assert.deepEqual(d.ais, [{ id: 'gemini' }]);
  assert.equal(d.settings.theme, 'retro');
  assert.equal(d.settings.projectRoot, 'D:\\p');
});

test('migrate: neuere Datei wird nicht ueberschrieben', () => {
  assert.throws(() => migrate({ version: SCHEMA_VERSION + 1 }), /newer-schema/);
});

test('Store: neue Installation legt leere, versionierte Datei an', () => {
  const dir = tmp();
  const s = new Store(dir);
  const d = s.load();
  assert.equal(s.fresh, true);
  assert.equal(d.version, SCHEMA_VERSION);
  assert.deepEqual(d.projects, []);
  assert.ok(fs.existsSync(path.join(dir, 'nexus-data.json')));
});

test('Store: atomar speichern, keine .tmp-Datei bleibt liegen', () => {
  const dir = tmp();
  const s = new Store(dir);
  s.load();
  s.data.projects.push({ id: 'x', name: 'X' });
  s.flush();
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'nexus-data.json'), 'utf8')).projects[0].id, 'x');
  assert.equal(fs.existsSync(path.join(dir, 'nexus-data.json.tmp')), false);
});

test('Store: save() buendelt Aenderungen und schreibt verzoegert', async () => {
  const dir = tmp();
  const s = new Store(dir, { delay: 20 });
  s.load();
  s.data.lastProject = 'a'; s.save();
  s.data.lastProject = 'b'; s.save();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(JSON.parse(fs.readFileSync(s.file, 'utf8')).lastProject, 'b');
});

test('Store: kaputte Datei wird beiseitegelegt und die neueste Sicherung geladen', () => {
  const dir = tmp();
  const day = (d) => () => new Date(`2026-11-${d}T10:00:00Z`);
  const s1 = new Store(dir, { now: day(10) });
  s1.load();
  s1.data.projects.push({ id: 'gesichert', name: 'G' });
  s1.flush();
  new Store(dir, { now: day(11) }).load(); // Sicherung vom 11. enthaelt das Projekt
  fs.writeFileSync(path.join(dir, 'nexus-data.json'), '{ kaputt');
  const s3 = new Store(dir, { now: day(12) });
  const d = s3.load();
  assert.equal(d.projects[0].id, 'gesichert');
  assert.ok(s3.recovered);
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('nexus-data.corrupt-')));
});

test('Store: eine Sicherung pro Tag, nur die letzten 7 bleiben', () => {
  const dir = tmp();
  for (let d = 1; d <= 10; d++) new Store(dir, { now: () => new Date(`2026-11-${String(d).padStart(2, '0')}T08:00:00Z`) }).load();
  new Store(dir, { now: () => new Date('2026-11-10T20:00:00Z') }).load(); // gleicher Tag: keine zweite
  const files = fs.readdirSync(path.join(dir, 'backups')).sort();
  assert.equal(files.length, KEEP_BACKUPS);
  assert.equal(files[0], 'nexus-data-2026-11-04.json');
  assert.equal(files.at(-1), 'nexus-data-2026-11-10.json');
});

test('migrate: fehlende Felder in aktueller Version werden ergaenzt', () => {
  const d = migrate({ version: SCHEMA_VERSION, projects: [{ id: 'a' }] });
  assert.deepEqual(d.desks, {});
  assert.deepEqual(d.ais, []);
  assert.deepEqual(d.settings, {});
  assert.equal(d.projects.length, 1);
});
