// Projekt-Kontext: Spiegelung in CLAUDE.md/AGENTS.md nur in einem markierten Abschnitt
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyBlock, writeContext, readContext, START, END } = require('../../src/main/context');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ctx-'));

test('applyBlock: neue Datei bekommt nur den Abschnitt', () => {
  const out = applyBlock('', 'Ziel: Reise planen');
  assert.ok(out.startsWith(START));
  assert.ok(out.includes('Ziel: Reise planen'));
  assert.ok(out.trim().endsWith(END));
});

test('applyBlock: eigener Inhalt bleibt, Abschnitt wird angehaengt und spaeter ersetzt', () => {
  const own = '# Mein Projekt\n\nEigene Regeln.\n';
  const v1 = applyBlock(own, 'Version 1');
  assert.ok(v1.startsWith('# Mein Projekt\n\nEigene Regeln.'));
  assert.ok(v1.includes('Version 1'));
  const v2 = applyBlock(v1, 'Version 2');
  assert.ok(v2.includes('Version 2'));
  assert.ok(!v2.includes('Version 1'));
  assert.equal(v2.split(START).length, 2, 'nur ein Abschnitt');
  assert.ok(v2.startsWith('# Mein Projekt'));
});

test('applyBlock: Text nach dem Abschnitt bleibt erhalten', () => {
  const file = `Oben\n\n${applyBlock('', 'alt').trim()}\n\nUnten\n`;
  const out = applyBlock(file, 'neu');
  assert.ok(out.startsWith('Oben'));
  assert.ok(out.trim().endsWith('Unten'));
  assert.ok(out.includes('neu') && !out.includes('alt'));
});

test('applyBlock: leerer Kontext entfernt nur den Abschnitt', () => {
  const file = applyBlock('# Eigenes\n', 'weg damit');
  assert.equal(applyBlock(file, '   ').trim(), '# Eigenes');
  assert.equal(applyBlock('# Ohne Abschnitt\n', ''), '# Ohne Abschnitt\n');
});

test('writeContext: schreibt .nexus/context.md und beide Spiegel, eigene CLAUDE.md bleibt', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Projektregeln\n\nNie force-pushen.\n');
  const written = writeContext(dir, 'Gemeinsames Wissen');
  assert.deepEqual(written.sort(), ['AGENTS.md', 'CLAUDE.md']);
  assert.equal(readContext(dir), 'Gemeinsames Wissen');
  const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
  assert.ok(claude.startsWith('# Projektregeln\n\nNie force-pushen.'));
  assert.ok(claude.includes('Gemeinsames Wissen'));
  assert.ok(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8').includes('Gemeinsames Wissen'));
});

test('writeContext: leerer Kontext legt keine Dateien an und loescht keine', () => {
  const dir = tmp();
  assert.deepEqual(writeContext(dir, ''), []);
  assert.equal(fs.existsSync(path.join(dir, 'CLAUDE.md')), false);
  writeContext(dir, 'etwas');
  writeContext(dir, '');
  assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')), 'Datei bleibt (NEXUS loescht nichts)');
  assert.ok(!fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8').includes('etwas'));
});
