// Sprachen: beide Woerterbuecher vollstaendig, Platzhalter gleich, jeder Schluessel im Code vorhanden.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dict, resolveLang, translator } = require('../../src/main/i18n');

const de = dict('de');
const en = dict('en');
const SRC = path.join(__dirname, '..', '..', 'src');
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('de und en haben dieselben Schluessel', () => {
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
});

test('Platzhalter stimmen in beiden Sprachen ueberein', () => {
  for (const k of Object.keys(de)) assert.deepEqual(vars(de[k]), vars(en[k]), k);
});

test('keine leeren Texte', () => {
  for (const [k, v] of [...Object.entries(de), ...Object.entries(en)]) assert.ok(v.trim(), k);
});

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sources(p) : /\.(js|html)$/.test(e.name) ? [p] : [];
  });
}

test('jeder im Code benutzte Schluessel steht im Woerterbuch', () => {
  const used = new Set();
  for (const f of sources(SRC)) {
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\b(?:t|tt|this\.t)\('([a-zA-Z0-9_.-]+)'/g)) used.add(m[1]);
    for (const m of s.matchAll(/\btn\('([a-zA-Z0-9_.-]+)'/g)) { used.add(m[1] + '.one'); used.add(m[1] + '.other'); }
    for (const m of s.matchAll(/(?:UserError\(|key: |labelKey: |btn\()'([a-zA-Z0-9_.-]+)'/g)) used.add(m[1]);
    for (const m of s.matchAll(/data-i18n(?:-title|-placeholder)?="([a-zA-Z0-9_.-]+)"/g)) used.add(m[1]);
  }
  // zusammengesetzte Schluessel
  for (const m of ['default', 'acceptEdits', 'auto', 'pushOnly', 'bypassPermissions', 'plan']) { used.add(`mode.${m}`); used.add(`mode.${m}.hint`); }
  for (const th of ['hell', 'creme', 'sand', 'nacht', 'retro', 'kupfer']) { used.add(`theme.${th}`); used.add(`theme.${th}.hint`); }
  for (const s of ['in', 'unknown', 'out', 'checking']) { used.add(`ai.status.${s}`); used.add(`ai.hint.${s}`); }
  for (const s of ['idle', 'checking', 'none', 'ready', 'off']) used.add(`update.status.${s}`);
  used.add('update.available');
  for (const s of ['busy', 'waiting', 'done']) used.add(`status.${s}`);
  for (const m of ['read-only', 'workspace-write', 'danger-full-access']) { used.add(`codexmode.${m}`); used.add(`codexmode.${m}.hint`); }
  for (const p of ['missing', 'loggedOut']) { used.add(`claude.${p}Title`); used.add(`claude.${p}Text`); }
  for (const k of ['start.newerMsg', 'start.newerDetail', 'start.failedMsg', 'start.failedDetail', 'migrate.lockedMsg', 'migrate.lockedDetail', 'migrate.errorMsg', 'migrate.errorDetail']) used.add(k);
  const missing = [...used].filter((k) => !(k in de));
  assert.deepEqual(missing, []);
  assert.ok(used.size > 150, 'Schluessel gefunden: ' + used.size);
});

test('resolveLang: Einstellung vor Windows-Sprache, sonst Deutsch nur fuer de-*', () => {
  assert.equal(resolveLang('en', 'de-DE'), 'en');
  assert.equal(resolveLang('auto', 'de-AT'), 'de');
  assert.equal(resolveLang('auto', 'en-US'), 'en');
  assert.equal(resolveLang('auto', 'fr-FR'), 'en');
});

test('translator: Platzhalter, Rueckfall auf Schluessel', () => {
  const t = translator('de');
  assert.equal(t('notify.body', { project: 'NEXUS', tool: 'Bash' }), 'NEXUS: Claude möchte Bash verwenden.');
  assert.equal(translator('en')('perm.wants', { tool: 'Bash' }), 'Claude wants to use Bash');
  assert.equal(t('gibt.es.nicht'), 'gibt.es.nicht');
});
