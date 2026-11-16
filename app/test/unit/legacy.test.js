const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { needsMigration, isLocked, migrateLegacy } = require('../../src/main/legacy');

function fakePrototype() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-legacy-'));
  const old = path.join(root, 'nexus-terminal-test');
  const w = (rel, content = 'x') => { const f = path.join(old, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };
  w('nexus-data.json', JSON.stringify({ projects: [{ id: 'p' }] }));
  w('Local State', '{"os_crypt":{}}');
  w('Partitions/nexus-claude/Network/Cookies', 'cookies');
  w('Partitions/nexus-claude/Cache/Cache_Data/data_0', 'cache');
  w('Cache/Cache_Data/f_0001', 'cache');
  w('GPUCache/index', 'cache');
  w('Code Cache/js/index', 'cache');
  w('lockfile', '');
  return { root, old, neu: path.join(root, 'NEXUS') };
}

test('needsMigration: nur wenn alte Daten da sind und neue fehlen', () => {
  const { old, neu } = fakePrototype();
  assert.equal(needsMigration(old, neu), true);
  fs.mkdirSync(neu, { recursive: true });
  fs.writeFileSync(path.join(neu, 'nexus-data.json'), '{}');
  assert.equal(needsMigration(old, neu), false);
  assert.equal(needsMigration(path.join(old, 'gibt-es-nicht'), path.join(old, 'auch-nicht')), false);
});

test('migrateLegacy: kopiert Daten und Anmeldungen, laesst Caches weg, Quelle bleibt', () => {
  const { old, neu } = fakePrototype();
  migrateLegacy(old, neu);
  assert.equal(JSON.parse(fs.readFileSync(path.join(neu, 'nexus-data.json'), 'utf8')).projects[0].id, 'p');
  assert.ok(fs.existsSync(path.join(neu, 'Local State')));
  assert.equal(fs.readFileSync(path.join(neu, 'Partitions/nexus-claude/Network/Cookies'), 'utf8'), 'cookies');
  for (const skipped of ['Cache', 'GPUCache', 'Code Cache', 'lockfile', 'Partitions/nexus-claude/Cache']) {
    assert.equal(fs.existsSync(path.join(neu, skipped)), false, skipped);
  }
  assert.ok(fs.existsSync(path.join(neu, 'migrated-from.txt')));
  // Quelle unveraendert
  assert.ok(fs.existsSync(path.join(old, 'Cache/Cache_Data/f_0001')));
  assert.ok(fs.existsSync(path.join(old, 'nexus-data.json')));
});

test('migrateLegacy: vorher angelegte Chromium-Dateien im Ziel werden ueberschrieben', () => {
  const { old, neu } = fakePrototype();
  fs.mkdirSync(neu, { recursive: true });
  fs.writeFileSync(path.join(neu, 'Local State'), '{"neu":true}');
  migrateLegacy(old, neu);
  assert.equal(fs.readFileSync(path.join(neu, 'Local State'), 'utf8'), '{"os_crypt":{}}');
});

test('isLocked: freie Sperrdatei gilt nicht als gesperrt', () => {
  const { old } = fakePrototype();
  assert.equal(isLocked(old), false);
  fs.rmSync(path.join(old, 'lockfile'));
  assert.equal(isLocked(old), false);
});
