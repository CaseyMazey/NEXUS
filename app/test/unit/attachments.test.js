const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { saveAttachment, pruneAttachments, safeName, KEEP_DAYS } = require('../../src/main/attachments');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-att-'));

test('safeName: keine Pfade, keine verbotenen Zeichen, keine Geraetenamen', () => {
  assert.equal(safeName('Lebenslauf Angelina.docx'), 'Lebenslauf Angelina.docx');
  assert.equal(safeName('..\\..\\Windows\\evil.exe'), 'evil.exe');
  assert.equal(safeName('a/b/c.txt'), 'c.txt');
  assert.equal(safeName('was?:<>.pdf'), 'was____.pdf');
  assert.equal(safeName('con.txt'), 'datei_con.txt');
  assert.equal(safeName('endet. '), 'endet');
});

test('saveAttachment: Kopie im Tagesordner, Inhalt gleich', () => {
  const root = tmp();
  const r = saveAttachment(root, 'Bericht.docx', new Uint8Array([1, 2, 3]), new Date('2026-11-17T10:00:00Z'));
  assert.equal(r.name, 'Bericht.docx');
  assert.equal(r.size, 3);
  assert.ok(r.path.startsWith(path.join(root, '2026-11-17')));
  assert.deepEqual([...fs.readFileSync(r.path)], [1, 2, 3]);
  // gleicher Name zweimal: zwei getrennte Kopien
  const r2 = saveAttachment(root, 'Bericht.docx', new Uint8Array([4]), new Date('2026-11-17T10:00:00Z'));
  assert.notEqual(r.path, r2.path);
});

test('saveAttachment: leere Datei wird abgelehnt', () => {
  assert.throws(() => saveAttachment(tmp(), 'x', new Uint8Array(0)), /empty/);
});

test('pruneAttachments: nur alte Tagesordner, fremde Dateien bleiben', () => {
  const root = tmp();
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  for (const n of [1, KEEP_DAYS + 2]) fs.mkdirSync(path.join(root, day(n), 'abc'), { recursive: true });
  fs.writeFileSync(path.join(root, 'fremd.txt'), 'x');
  pruneAttachments(root);
  const left = fs.readdirSync(root);
  assert.ok(left.includes(day(1)));
  assert.ok(!left.includes(day(KEEP_DAYS + 2)));
  assert.ok(left.includes('fremd.txt'));
});
