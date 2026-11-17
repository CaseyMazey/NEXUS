// Nutzungslimit erkennen und Reset-Zeit bestimmen
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLimit, parseResetText } = require('../../src/renderer/limit');

const at = (s) => new Date(s).getTime();

test('5-Stunden-Limit: Uhrzeit heute', () => {
  const now = at('2026-11-17T10:55:00');
  const r = parseLimit("You've hit your 5-hour limit · resets 12:40pm (Europe/Berlin)", null, now);
  assert.equal(r.hit, true);
  assert.equal(new Date(r.resetAt).getHours(), 12);
  assert.equal(new Date(r.resetAt).getMinutes(), 40);
  assert.equal(new Date(r.resetAt).getDate(), 17);
});

test('Uhrzeit schon vorbei: morgen', () => {
  const r = parseResetText('resets 9am', at('2026-11-17T23:10:00'));
  assert.equal(new Date(r).getDate(), 18);
  assert.equal(new Date(r).getHours(), 9);
});

test('Wochenlimit mit Datum', () => {
  const r = parseResetText("You've hit your weekly limit · resets Nov 21, 11am (Europe/Berlin)", at('2026-11-17T12:00:00'));
  const d = new Date(r);
  assert.equal(d.getMonth(), 10);
  assert.equal(d.getDate(), 21);
  assert.equal(d.getHours(), 11);
});

test('12am/12pm richtig', () => {
  const now = at('2026-11-17T08:00:00');
  assert.equal(new Date(parseResetText('resets 12pm', now)).getHours(), 12);
  assert.equal(new Date(parseResetText('resets 12am', now)).getHours(), 0);
});

test('ohne Uhrzeit im Text: resetsAt aus dem rate_limit_event', () => {
  const now = at('2026-11-17T10:00:00');
  const r = parseLimit('Usage limit reached', { status: 'rejected', resetsAt: (now + 3600000) / 1000 }, now);
  assert.equal(r.hit, true);
  assert.equal(r.resetAt, now + 3600000);
});

test('normale Antworten und Warnungen sind kein Limit', () => {
  assert.equal(parseLimit('Fertig. Ich habe die Tests repariert.', { status: 'allowed_warning', resetsAt: 1 }).hit, false);
  assert.equal(parseLimit('', null).hit, false);
});
