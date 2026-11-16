// M4: Protokoll und Claude-Code-Pruefung
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scrub, KEEP_DAYS } = require('../../src/main/log');
const { parseStatus } = require('../../src/main/claude-check');

test('Protokoll: E-Mail-Adressen werden unkenntlich gemacht', () => {
  assert.equal(scrub('angemeldet als max.muster+x@example.co.uk heute'), 'angemeldet als <email> heute');
  assert.equal(scrub('[claude] {"installed":true}'), '[claude] {"installed":true}');
});

test('Protokoll: alte Dateien werden nach 14 Tagen entfernt, fremde nie', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-log-'));
  const logs = path.join(dir, 'logs');
  fs.mkdirSync(logs);
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  for (const n of [0, 5, KEEP_DAYS + 3]) fs.writeFileSync(path.join(logs, `nexus-${day(n)}.log`), 'x');
  fs.writeFileSync(path.join(logs, 'fremd.txt'), 'x');
  // prune() arbeitet auf dem Ordner aus initLog(); hier direkt mit frischem Modul
  delete require.cache[require.resolve('../../src/main/log')];
  const log = require('../../src/main/log');
  const orig = { log: console.log, warn: console.warn, error: console.error };
  log.initLog(dir);
  Object.assign(console, orig); // Konsole fuer die weiteren Tests wiederherstellen
  const left = fs.readdirSync(logs).sort();
  assert.ok(left.includes('fremd.txt'));
  assert.ok(left.includes(`nexus-${day(0)}.log`));
  assert.ok(left.includes(`nexus-${day(5)}.log`));
  assert.ok(!left.includes(`nexus-${day(KEEP_DAYS + 3)}.log`));
});

test('Claude Code: angemeldet, abgemeldet, nicht installiert', () => {
  assert.deepEqual(parseStatus({ stdout: '{"loggedIn":true,"email":"x@y.de"}', stderr: '' }), { installed: true, loggedIn: true });
  assert.deepEqual(parseStatus({ stdout: '{"loggedIn":false}', stderr: '', err: { code: 1 } }), { installed: true, loggedIn: false });
  assert.deepEqual(parseStatus({ stdout: '', stderr: "'claude' is not recognized as an internal or external command", err: { code: 1 } }), { installed: false, loggedIn: false });
  assert.deepEqual(parseStatus({ stdout: '', stderr: 'Der Befehl "claude" ist entweder falsch geschrieben oder\nkonnte nicht gefunden werden. nicht als interner oder externer Befehl', err: { code: 1 } }), { installed: false, loggedIn: false });
  // Ergebnis enthaelt nie Kontodaten
  assert.equal(Object.keys(parseStatus({ stdout: '{"loggedIn":true,"email":"x@y.de","orgId":"1"}', stderr: '' })).includes('email'), false);
});
