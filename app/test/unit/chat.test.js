// 3C-Modus "Fragt nur bei Push": NEXUS erlaubt jede Rueckfrage selbst, ausser git push.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ChatSession, isPush } = require('../../src/main/chat');

// ChatSession ohne echten Claude-Code-Prozess
function fakeSession(pushOnly) {
  const s = Object.create(ChatSession.prototype);
  Object.assign(s, { pending: new Map(), ownRequests: new Map(), pushOnly, denyMessage: 'no', written: [], events: [] });
  s._write = (o) => s.written.push(o);
  s.onEvent = (e) => s.events.push(e);
  return s;
}
const ask = (id, command, tool = 'Bash') => ({ type: 'control_request', request_id: id, request: { subtype: 'can_use_tool', tool_name: tool, input: { command } } });

test('isPush: erkennt git push, aber nicht pull, stash push oder Text', () => {
  for (const c of ['git push', 'git push -u origin main', 'git add . && git commit -m x && git push', 'git -C repo push']) assert.ok(isPush({ input: { command: c } }), c);
  for (const c of ['git pull', 'git stash push', 'git commit -m "push it"', 'npm run push', 'echo git']) assert.ok(!isPush({ input: { command: c } }), c);
  assert.ok(!isPush({ input: { file_path: 'x' } }));
});

test('pushOnly: Befehl ohne Push wird sofort erlaubt, keine Karte', () => {
  const s = fakeSession(true);
  s._route(ask('r1', 'npm test'));
  assert.equal(s.events.length, 0);
  assert.equal(s.written[0].response.request_id, 'r1');
  assert.equal(s.written[0].response.response.behavior, 'allow');
});

test('pushOnly: git push zeigt die Erlauben-Karte', () => {
  const s = fakeSession(true);
  s._route(ask('r2', 'git push origin main'));
  assert.equal(s.written.length, 0);
  assert.equal(s.events[0].type, 'permission');
});

test('ohne pushOnly kommt jede Rueckfrage als Karte', () => {
  const s = fakeSession(false);
  s._route(ask('r3', 'npm test'));
  assert.equal(s.written.length, 0);
  assert.equal(s.events[0].type, 'permission');
});
