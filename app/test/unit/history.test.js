// Verlauf einer Claude-Code-Sitzung: uuids, Abzweigpunkt ("before") und Kuerzen bis zu einer Nachricht
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readHistoryFile } = require('../../src/main/sessions');

const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;
function fixture() {
  const lines = [
    { type: 'user', uuid: U(1), timestamp: '2026-11-17T10:00:00Z', message: { content: 'Erste Frage' } },
    { type: 'assistant', uuid: U(2), timestamp: '2026-11-17T10:00:05Z', message: { content: [{ type: 'text', text: 'Erste Antwort' }] } },
    { type: 'user', uuid: U(3), timestamp: '2026-11-17T10:01:00Z', message: { content: 'Zweite Frage' } },
    { type: 'assistant', uuid: U(4), timestamp: '2026-11-17T10:01:05Z', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] } },
    { type: 'user', uuid: U(5), timestamp: '2026-11-17T10:01:06Z', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'a.txt' }] } },
    { type: 'assistant', uuid: U(6), timestamp: '2026-11-17T10:01:09Z', message: { content: [{ type: 'text', text: 'Zweite Antwort' }] } },
  ];
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-hist-')), 's.jsonl');
  fs.writeFileSync(f, lines.map((l) => JSON.stringify(l)).join('\n'));
  return f;
}

test('Eintraege haben uuids, Nutzer-Nachrichten den Abzweigpunkt davor', () => {
  const h = readHistoryFile(fixture());
  assert.deepEqual(h.map((x) => x.kind), ['user', 'assistant', 'user', 'tool', 'assistant']);
  assert.equal(h[0].before, null); // erste Nachricht: Abzweigen = neuer Chat
  assert.equal(h[1].uuid, U(2));
  assert.equal(h[2].before, U(2)); // "Zweite Frage" bearbeiten: ab der ersten Antwort abzweigen
  assert.equal(h[3].result, 'a.txt');
  assert.equal(h[4].uuid, U(6));
});

test('until: Verlauf nur bis zur gewaehlten Nachricht (abgezweigter Chat)', () => {
  const h = readHistoryFile(fixture(), 300, U(2));
  assert.deepEqual(h.map((x) => x.text), ['Erste Frage', 'Erste Antwort']);
});
