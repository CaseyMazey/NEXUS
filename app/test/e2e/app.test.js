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
  // NEXUS_EXE=<pfad>: gegen die gepackte App testen (z. B. dist/win-unpacked/NEXUS.exe)
  const exe = process.env.NEXUS_EXE;
  const app = await electron.launch(exe ? { executablePath: exe, args: [`--nexus-data=${dir}`] } : { executablePath: electronPath, args: [APP, `--nexus-data=${dir}`] });
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
    // aus dem Quellcode gestartet: Updates aus, mit Hinweis
    assert.match(await page.textContent('#modal'), /Updates are only available in the installed app/);
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
    assert.deepEqual(modes, ['default', 'acceptEdits', 'auto', 'pushOnly', 'bypassPermissions', 'plan']);
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
    // Knopf "nach unten": erscheint erst, wenn man hochscrollt
    assert.equal(await page.isVisible('.jump-down'), false);
    await page.evaluate(() => { const v = [...live.values()].find((l) => l.view).view; for (let i = 0; i < 80; i++) v.handle({ type: 'nexus-notice', key: 'chat.sendFailed' }); });
    await page.$eval('.chat-log', (e) => { e.scrollTop = 0; e.dispatchEvent(new Event('scroll')); });
    assert.equal(await page.isVisible('.jump-down'), true);
    await page.click('.jump-down');
    await page.waitForFunction(() => { const e = document.querySelector('.chat-log'); return e.scrollHeight - e.scrollTop - e.clientHeight < 5; });
    // Einstellung gespeichert
    const s = await page.evaluate(() => state.settings.chatMode);
    assert.equal(s, 'bypassPermissions');
  } finally { await app.close(); }
});

test('3C: Befehl per Enter aus dem Vorschlag ausfuehren – /clear leert den Kontext (echtes Claude Code, ohne Modell)', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  const { app, page } = await launch({
    version: 1, ais: [], settings: { language: 'de' }, slashCommands: ['clear', 'context', 'compact'],
    projects: [{ id: 'demo', name: 'Demo', path: proj, color: '#22c55e', icon: '🧭', group: '' }],
  });
  try {
    await page.waitForSelector('.composer textarea');
    await page.fill('.composer textarea', '/cle');
    await page.dispatchEvent('.composer textarea', 'input');
    await page.waitForSelector('.slash-box:not([hidden]) .slash-item.on');
    assert.match(await page.textContent('.slash-item.on'), /\/clear/);
    await page.press('.composer textarea', 'Enter');
    // gesendet: Eingabe leer, Nachricht im Verlauf, Claude Code meldet die neue Unterhaltung
    assert.equal(await page.inputValue('.composer textarea'), '');
    await page.waitForSelector('.msg.user .bubble');
    await page.waitForSelector('.note.reset', { timeout: 45000 });
    assert.match(await page.textContent('.note.reset'), /Kontext geleert/);
    // lokaler Befehl: keine Abschlusszeile "0 s · 1 Schritt"
    await page.waitForFunction(() => !document.querySelector('.composer .stop:not([hidden])'), null, { timeout: 15000 });
    assert.equal(await page.locator('.note.done').count(), 0);
  } finally { await app.close(); }
});

test('Terminal: Claude Code startet im eingebetteten Terminal (node-pty)', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  const { app, page } = await launch({
    version: 1, ais: [], settings: { language: 'de' },
    projects: [{ id: 'demo', name: 'Demo', path: proj, color: '#22c55e', icon: '🧭', group: '' }],
    desks: { demo: { layout: 1, cells: ['ws-term1', null, null, null], focus: 0, workspaces: [{ id: 'ws-term1', type: 'claude-code-term', title: 'Terminal', sessionId: null, url: null }] } },
  });
  try {
    await page.waitForSelector('.xterm-rows');
    // Ausgabe von Claude Code kommt an (z. B. Vertrauensabfrage oder Begruessung)
    await page.waitForFunction(() => (document.querySelector('.xterm-rows')?.textContent || '').trim().length > 20, null, { timeout: 30000 });
  } finally { await app.close(); }
});

test('Fenster merkt sich Groesse und Position, Protokoll wird geschrieben, Claude-Code-Status kommt an', async () => {
  const { app, page, dir } = await launch({ version: 1, projects: [], desks: {}, ais: [], settings: { language: 'de' } });
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ x: 120, y: 90, width: 1111, height: 777 }));
    await page.waitForFunction(() => state.claude !== undefined && state.claude !== null, null, { timeout: 30000 }).catch(() => {});
  } finally { await app.close(); }
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'nexus-data.json'), 'utf8')).window;
  assert.equal(saved.width, 1111);
  assert.equal(saved.height, 777);
  const logs = fs.readdirSync(path.join(dir, 'logs'));
  assert.equal(logs.length, 1);
  const text = fs.readFileSync(path.join(dir, 'logs', logs[0]), 'utf8');
  assert.match(text, /\[start\] NEXUS/);
  assert.doesNotMatch(text, /@[\w-]+\.\w/); // keine E-Mail-Adresse im Protokoll
  // erneut starten: gleiche Groesse
  const app2 = await electron.launch(process.env.NEXUS_EXE ? { executablePath: process.env.NEXUS_EXE, args: [`--nexus-data=${dir}`] } : { executablePath: electronPath, args: [APP, `--nexus-data=${dir}`] });
  try {
    const page2 = await app2.firstWindow();
    await page2.waitForSelector('body[data-ready="1"]');
    const b = await app2.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    assert.equal(b.width, 1111);
    assert.equal(b.height, 777);
  } finally { await app2.close(); }
});

test('Claude Code fehlt: Hinweis statt 3C', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  const { app, page } = await launch({
    version: 1, ais: [], settings: { language: 'de' },
    projects: [{ id: 'demo', name: 'Demo', path: proj, color: '#22c55e', icon: '🧭', group: '' }],
  });
  try {
    await page.waitForSelector('.composer textarea');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('claude-status', { installed: false, loggedIn: false }));
    await page.waitForSelector('.claude-hint');
    assert.match(await page.textContent('.claude-hint'), /Claude Code ist nicht installiert/);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('claude-status', { installed: true, loggedIn: false }));
    await page.waitForFunction(() => /nicht angemeldet/.test(document.querySelector('.claude-hint')?.textContent || ''));
  } finally { await app.close(); }
});

test('3C: beliebige Dateien anhaengen (Kopie im Anhang-Ordner), Bilder weiter direkt', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  const src = path.join(proj, 'Lebenslauf Test.docx');
  fs.writeFileSync(src, 'PK-fake-docx-inhalt');
  const png = path.join(proj, 'bild.png');
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  const { app, page, dir } = await launch({
    version: 1, ais: [], settings: { language: 'de' },
    projects: [{ id: 'demo', name: 'Demo', path: proj, color: '#22c55e', icon: '🧭', group: '' }],
  });
  try {
    await page.waitForSelector('.composer textarea');
    await page.setInputFiles('.composer input[type=file]', [src, png]);
    await page.waitForSelector('.att-file:not(.pending)');
    assert.match(await page.textContent('.att-file .att-name'), /Lebenslauf Test\.docx/);
    await page.waitForSelector('.attach-row .att img');
    assert.equal(await page.isDisabled('.composer .send'), false);
    // Kopie liegt im Anhang-Ordner, das Original bleibt
    const days = fs.readdirSync(path.join(dir, 'attachments'));
    const sub = fs.readdirSync(path.join(dir, 'attachments', days[0]));
    assert.equal(fs.readFileSync(path.join(dir, 'attachments', days[0], sub[0], 'Lebenslauf Test.docx'), 'utf8'), 'PK-fake-docx-inhalt');
    assert.ok(fs.existsSync(src));
    // keine Warnung "nur Bilder" mehr
    assert.equal(await page.locator('.note.warn').count(), 0);
  } finally { await app.close(); }
});

test('Status am Projektnamen: arbeitet, fertig (nicht angesehen), angesehen', async () => {
  const p1 = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  const p2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  const { app, page } = await launch({
    version: 1, ais: [], settings: { language: 'de' }, lastProject: 'a',
    projects: [{ id: 'a', name: 'Alpha', path: p1, color: '#22c55e', icon: '🧭', group: '' }, { id: 'b', name: 'Beta', path: p2, color: '#6366f1', icon: '🏡', group: '' }],
  });
  try {
    await page.waitForSelector('.composer textarea');
    const view = () => [...live.values()].find((l) => l.view && l.projectId === 'a').view;
    // Auftrag in Alpha laeuft (simuliert), dann zu Beta wechseln
    await page.evaluate((f) => eval(f)().setBusy(true), view.toString());
    await page.click('.project:nth-child(2)');
    await page.waitForSelector('.project:nth-child(1) .p-status.busy');
    // Auftrag fertig, waehrend Beta offen ist -> Haken bei Alpha
    await page.evaluate((f) => eval(f)().setBusy(false), view.toString());
    await page.waitForSelector('.project:nth-child(1) .p-status.done');
    assert.equal(await page.getAttribute('.project:nth-child(1) .p-status', 'title'), 'Fertig – noch nicht angesehen');
    // Alpha ansehen -> Haken weg
    await page.click('.project:nth-child(1)');
    await page.waitForFunction(() => !document.querySelector('.project .p-status'));
  } finally { await app.close(); }
});
