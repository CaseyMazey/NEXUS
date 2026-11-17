// Codex-Ereignisse -> Format der Chat-Ansicht
const test = require('node:test');
const assert = require('node:assert/strict');
const { mapEvent, cliCommand } = require('../../src/main/codex');

const run = (events) => { const ctx = { steps: 0, start: Date.now() - 1000 }; return events.flatMap((e) => mapEvent(e, ctx)); };

test('Antwort, Befehl und Abschluss werden wie bei Claude Code dargestellt', () => {
  const out = run([
    { type: 'thread.started', thread_id: '01a1e8bf-8ae0-72a3-85f4-5829f625a521' },
    { type: 'turn.started' },
    { type: 'item.started', item: { id: 'i0', type: 'command_execution', command: 'ls' } },
    { type: 'item.completed', item: { id: 'i0', type: 'command_execution', command: 'ls', aggregated_output: 'a.txt', exit_code: 0, status: 'completed' } },
    { type: 'item.completed', item: { id: 'i1', type: 'agent_message', text: 'Fertig.' } },
    { type: 'turn.completed', usage: {} },
  ]);
  assert.equal(out[0].data.subtype, 'init');
  assert.equal(out[0].data.session_id, '01a1e8bf-8ae0-72a3-85f4-5829f625a521');
  const tools = out.filter((e) => e.data?.message?.content?.[0]?.type === 'tool_use');
  assert.equal(tools[0].data.message.content[0].name, 'Bash');
  const res = out.find((e) => e.data?.message?.content?.[0]?.type === 'tool_result');
  assert.equal(res.data.message.content[0].content, 'a.txt');
  assert.equal(res.data.message.content[0].is_error, false);
  assert.ok(out.some((e) => e.data?.message?.content?.[0]?.text === 'Fertig.'));
  const done = out.at(-1).data;
  assert.equal(done.type, 'result');
  assert.equal(done.subtype, 'success');
  assert.equal(done.num_turns, 2);
});

test('Fehler: fehlgeschlagener Befehl, Fehlermeldung, abgebrochener Lauf', () => {
  const out = run([
    { type: 'item.completed', item: { id: 'x', type: 'command_execution', command: 'boom', aggregated_output: 'nope', exit_code: 1, status: 'failed' } },
    { type: 'error', message: 'model not supported' },
    { type: 'turn.failed', error: { message: 'model not supported' } },
  ]);
  assert.equal(out.find((e) => e.data?.message?.content?.[0]?.type === 'tool_result').data.message.content[0].is_error, true);
  assert.ok(out.some((e) => e.type === 'nexus-stderr' && /model not supported/.test(e.text)));
  assert.equal(out.at(-1).data.is_error, true);
});

test('Dateiaenderungen erscheinen als Edit-Karte', () => {
  const out = run([{ type: 'item.completed', item: { id: 'f', type: 'file_change', changes: [{ path: 'src/a.js', kind: 'update' }], status: 'completed' } }]);
  assert.equal(out[0].data.message.content[0].name, 'Edit');
  assert.equal(out[0].data.message.content[0].input.file_path, 'src/a.js');
});

test('Aufruf: Windows ueber cmd.exe', () => {
  assert.equal(cliCommand(['exec'], { ComSpec: 'cmd.exe' }).args.slice(0, 3).join(' '), process.platform === 'win32' ? '/d /c codex' : 'exec');
});
