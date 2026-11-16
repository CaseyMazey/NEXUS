// Oberflaechentests: startet die echte App mit eigenem, leerem Datenordner (echte Daten bleiben unberuehrt).
// Es wird nichts an Claude gesendet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

const APP = path.join(__dirname, '..', '..');
const electronPath = require('electron');

async function launch(data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-e2e-'));
  if (data) fs.writeFileSync(path.join(dir, 'nexus-data.json'), JSON.stringify(data));
  const app = await electron.launch({ executablePath: electronPath, args: [APP, `--nexus-data=${dir}`] });
  const page = await app.firstWindow();
  await page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
  return { app, page, dir };
}

test('erster Start: leere Daten, Willkommen, Deutsch', async () => {
  const { app, page, dir } = await launch({ version: 1, projects: [], desks: {}, ais: [], settings: { language: 'de' } });
  try {
    assert.equal(await page.textContent('.side-label span'), 'Projekte');
    assert.match(await page.textContent('#grid'), /Willkommen bei NEXUS/);
    assert.equal(await page.locator('.project').count(), 0);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'nexus-data.json'), 'utf8'));
    assert.equal(saved.version, 1);
    assert.ok(fs.existsSync(path.join(dir, 'backups')));
  } finally { await app.close(); }
});

test('Englisch, Projekt und Einstellungen', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  const { app, page } = await launch({
    version: 1, ais: [], settings: { language: 'en', theme: 'creme' },
    projects: [{ id: 'demo', name: 'Demo', path: proj, color: '#22c55e', icon: '🧭', group: '' }],
    desks: { demo: { layout: 1, cells: [null, null, null, null], focus: 0, workspaces: [] } },
  });
  try {
    assert.equal(await page.textContent('.side-label span'), 'Projects');
    assert.equal(await page.textContent('.project .name'), 'Demo');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'creme');
    assert.equal(await page.getAttribute('html', 'lang'), 'en');
    await page.click('#settings');
    assert.equal(await page.textContent('#modal h2'), 'Settings');
    assert.equal(await page.locator('#modal select.m-select').inputValue(), 'en');
    // Sprache umstellen zeigt den Neustart-Hinweis
    await page.selectOption('#modal select.m-select', 'de');
    await page.waitForSelector('#modal .m-note');
    // keine deutschen Texte in der englischen Oberflaeche
    const text = await page.textContent('body');
    assert.doesNotMatch(text.replace(/Deutsch/g, ''), /\b(Projekte|Einstellungen|Sitzungen|Anmelden)\b/);
  } finally { await app.close(); }
});

test('3C: Nie fragen im Dropdown, Einreihen waehrend eines Auftrags, Vorschlag per Tab', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  const { app, page } = await launch({
    version: 1, ais: [], settings: { language: 'de' },
    projects: [{ id: 'demo', name: 'Demo', path: proj, color: '#22c55e', icon: '🧭', group: '' }],
  });
  try {
    await page.waitForSelector('.composer textarea');
    const modes = await page.$$eval('.composer select:not(.model-sel) option', (o) => o.map((x) => x.value));
    assert.deepEqual(modes, ['default', 'acceptEdits', 'auto', 'bypassPermissions', 'plan']);
    await page.selectOption('.composer select:not(.model-sel)', 'bypassPermissions');
    assert.ok(await page.$('.composer select.bypass'));
    // Auftrag laeuft (simuliert): Senden-Knopf bleibt sichtbar und reiht ein
    await page.evaluate(() => [...live.values()].find((l) => l.view).view.setBusy(true));
    assert.equal(await page.isVisible('.composer .send'), true);
    assert.ok(await page.$('.composer .send.queue'));
    assert.equal(await page.isVisible('.composer .stop'), true);
    await page.evaluate(() => [...live.values()].find((l) => l.view).view.setBusy(false));
    // Vorschlag von Claude Code -> Tab uebernimmt ihn
    await page.evaluate(() => [...live.values()].find((l) => l.view).view.handle({ type: 'raw', data: { type: 'prompt_suggestion', suggestion: 'Tests laufen lassen' } }));
    assert.match(await page.getAttribute('.composer textarea', 'placeholder'), /Tests laufen lassen/);
    await page.focus('.composer textarea');
    await page.keyboard.press('Tab');
    assert.equal(await page.inputValue('.composer textarea'), 'Tests laufen lassen');
    // Einstellung gespeichert
    const s = await page.evaluate(() => state.settings.chatMode);
    assert.equal(s, 'bypassPermissions');
  } finally { await app.close(); }
});
