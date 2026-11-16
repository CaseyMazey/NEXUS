const test = require('node:test');
const assert = require('node:assert/strict');
const { UserError, cleanName, folderName, newProjectId, cleanDesk, buildContent } = require('../../src/main/validate');
const { normalize } = require('../../src/main/settings');

test('cleanName: kuerzt Leerraum, lehnt leer und zu lang ab', () => {
  assert.equal(cleanName('  Mein   Projekt '), 'Mein Projekt');
  assert.throws(() => cleanName('   '), UserError);
  assert.throws(() => cleanName('x'.repeat(61)), (e) => e.key === 'err.nameLength');
  assert.throws(() => cleanName(42), UserError);
});

test('folderName: verbotene Zeichen und Windows-Namen', () => {
  assert.equal(folderName('NEXUS 2'), 'NEXUS 2');
  for (const bad of ['a/b', 'a\\b', 'a:b', 'what?', 'con', 'LPT1', 'endet.', 'endet ']) {
    assert.throws(() => folderName(bad), (e) => e.key === 'err.folderChars', bad);
  }
});

test('newProjectId: Umlaute, Sonderzeichen, Dubletten', () => {
  const taken = new Set(['mein-projekt']);
  assert.equal(newProjectId('Übersicht & Plan', () => false), 'ubersicht-plan');
  assert.equal(newProjectId('Mein Projekt', (id) => taken.has(id)), 'mein-projekt-2');
  assert.equal(newProjectId('🎮', () => false), 'project');
});

test('cleanDesk: unbekannte Typen raus, Zellen und Fokus begrenzt, URLs nur https', () => {
  const d = cleanDesk({
    layout: 9, focus: 3,
    cells: ['ws-aaaa', 'ws-gone', null, null],
    workspaces: [
      { id: 'ws-aaaa', type: 'claude-code', title: 'x'.repeat(100), sessionId: 'kein-uuid', url: 'http://unsicher' },
      { id: 'ws-bbbb', type: 'unbekannt' },
      { id: 'ws-cccc', type: 'claude', url: 'https://claude.ai/chat/1', sessionId: '12345678-1234-1234-1234-123456789abc' },
    ],
  }, (t) => ['claude-code', 'claude'].includes(t));
  assert.equal(d.layout, 1);
  assert.equal(d.focus, 0);
  assert.deepEqual(d.cells, ['ws-aaaa', null, null, null]);
  assert.equal(d.workspaces.length, 2);
  assert.equal(d.workspaces[0].title.length, 80);
  assert.equal(d.workspaces[0].sessionId, null);
  assert.equal(d.workspaces[0].url, null);
  assert.equal(d.workspaces[1].url, 'https://claude.ai/chat/1');
  assert.equal(cleanDesk(null, () => true), null);
});

test('buildContent: Text, Bilder, Muell', () => {
  assert.equal(buildContent('hallo'), 'hallo');
  assert.equal(buildContent('   '), null);
  assert.equal(buildContent({ text: 'nur text' }), 'nur text');
  const c = buildContent({ text: 'sieh mal', images: [{ media_type: 'image/png', data: 'iVBORw0KGgo=' }, { media_type: 'text/html', data: 'x' }, { media_type: 'image/png', data: '<script>' }] });
  assert.equal(c.length, 2);
  assert.equal(c[0].type, 'image');
  assert.equal(c[1].text, 'sieh mal');
  assert.equal(buildContent(null), null);
});

test('Einstellungen: Standardwerte, ungueltige Werte ersetzt, Nie-fragen erlaubt', () => {
  const s = normalize({ theme: 'gibts-nicht', lightTheme: 'nacht', chatMode: 'bypassPermissions', language: 'fr', foo: 1, projectRoot: 'relativ' });
  assert.equal(s.theme, 'nacht');
  assert.equal(s.lightTheme, 'hell');
  assert.equal(s.chatMode, 'bypassPermissions');
  assert.equal(s.language, 'auto');
  assert.equal(s.foo, undefined);
  assert.equal(s.projectRoot, undefined);
});
