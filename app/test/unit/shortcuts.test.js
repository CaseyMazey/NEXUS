const test = require('node:test');
const assert = require('node:assert/strict');
const { shortcutFor } = require('../../src/main/shortcuts');

const k = (key, mods = {}, code) => ({ type: 'keyDown', key, code: code || (/^[0-9]$/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`), control: false, meta: false, shift: false, alt: false, ...mods });

test('Windows/Linux: Strg-Kuerzel', () => {
  assert.equal(shortcutFor(k('3', { control: true }), false), 'project:3');
  assert.equal(shortcutFor(k('!', { control: true, shift: true }, 'Digit1'), false), 'layout:1');
  assert.equal(shortcutFor(k('k', { control: true }), false), 'palette');
  assert.equal(shortcutFor(k('n', { control: true }), false), 'new-chat');
  assert.equal(shortcutFor(k('N', { control: true, shift: true }), false), 'new-codex');
  assert.equal(shortcutFor(k(',', { control: true }, 'Comma'), false), 'settings');
  assert.equal(shortcutFor(k('w', { control: true }), false), 'close-ws');
  assert.equal(shortcutFor(k('Tab', { control: true }, 'Tab'), false), 'ws:next');
  assert.equal(shortcutFor(k('Tab', { control: true, shift: true }, 'Tab'), false), 'ws:prev');
});

test('Mac: ⌘ statt Strg, Strg+K bleibt frei', () => {
  assert.equal(shortcutFor(k('k', { meta: true }), true), 'palette');
  assert.equal(shortcutFor(k('k', { control: true }), true), null);
  assert.equal(shortcutFor(k('2', { meta: true }), true), 'project:2');
});

test('normale Tasten, Strg+C/V, AltGr und keyUp loesen nichts aus', () => {
  assert.equal(shortcutFor(k('k'), false), null);
  assert.equal(shortcutFor(k('c', { control: true }), false), null);
  assert.equal(shortcutFor(k('v', { control: true }), false), null);
  assert.equal(shortcutFor(k('q', { control: true, alt: true }), false), null);
  assert.equal(shortcutFor({ ...k('k', { control: true }), type: 'keyUp' }, false), null);
});
