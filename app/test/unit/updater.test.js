const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Updater } = require('../../src/main/updater');

// Updater mit nachgebautem electron-updater
function make({ enabled = true, setting = true } = {}) {
  const sent = [];
  const u = new Updater({ enabled, isEnabledSetting: () => setting, toUi: (ch, s) => sent.push(s), log: () => {} });
  const au = new EventEmitter();
  au.checks = 0; au.installed = null;
  au.checkForUpdates = async () => { au.checks++; };
  au.quitAndInstall = (silent, run) => { au.installed = { silent, run }; };
  u.au = au;
  return { u, au, sent };
}

test('aus dem Quellcode: Updates aus', () => {
  const { u } = make({ enabled: false });
  assert.equal(u.state.status, 'off');
});

test('automatische Pruefung respektiert die Einstellung, manuelle nicht', async () => {
  const { u, au } = make({ setting: false });
  await u.check(false);
  assert.equal(au.checks, 0);
  await u.check(true);
  assert.equal(au.checks, 1);
});

test('installieren nur, wenn ein Update fertig geladen ist', async () => {
  const { u, au } = make();
  u.install();
  assert.equal(au.installed, null);
  u.set({ status: 'ready', version: '0.1.2' });
  u.install();
  assert.deepEqual(au.installed, { silent: true, run: true });
});

test('waehrend des Ladens keine zweite Pruefung', async () => {
  const { u, au } = make();
  u.set({ status: 'downloading', version: '0.1.2' });
  await u.check(true);
  assert.equal(au.checks, 0);
});
