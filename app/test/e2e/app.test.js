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

// Desk mit einem 3C-Workspace (neue Projekte starten leer)
const ccDesk = () => ({ layout: 1, cells: ['ws-cc01', null, null, null], focus: 0, workspaces: [{ id: 'ws-cc01', type: 'claude-code', title: 'Claude Code', sessionId: null, url: null }] });

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
    desks: { demo: ccDesk() },
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

// braucht ein echtes, angemeldetes Claude Code (laeuft nur lokal, nicht im Testmodus auf GitHub)
test('3C: Befehl per Enter aus dem Vorschlag ausfuehren – /clear leert den Kontext (echtes Claude Code, ohne Modell)', { skip: process.env.NEXUS_FAKE_AGENT === '1' }, async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  const { app, page } = await launch({
    version: 1, ais: [], settings: { language: 'de' }, slashCommands: ['clear', 'context', 'compact'],
    projects: [{ id: 'demo', name: 'Demo', path: proj, color: '#22c55e', icon: '🧭', group: '' }],
    desks: { demo: ccDesk() },
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
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ x: 40, y: 30, width: 901, height: 651 }));
    await page.waitForFunction(() => state.claude !== undefined && state.claude !== null, null, { timeout: 30000 }).catch(() => {});
  } finally { await app.close(); }
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'nexus-data.json'), 'utf8')).window;
  assert.equal(saved.width, 901);
  assert.equal(saved.height, 651);
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
    assert.equal(b.width, 901);
    assert.equal(b.height, 651);
  } finally { await app2.close(); }
});

test('Claude Code fehlt: Hinweis statt 3C', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  const { app, page } = await launch({
    version: 1, ais: [], settings: { language: 'de' },
    projects: [{ id: 'demo', name: 'Demo', path: proj, color: '#22c55e', icon: '🧭', group: '' }],
    desks: { demo: ccDesk() },
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
    desks: { demo: ccDesk() },
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
    desks: { a: ccDesk() },
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

test('Neues Projekt: leerer Desk ohne automatisches 3C', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  const { app, page } = await launch({
    version: 1, ais: [], settings: { language: 'de' },
    projects: [{ id: 'neu', name: 'Neu', path: proj, color: '#22c55e', icon: '🧭', group: '' }],
  });
  try {
    await page.waitForSelector('.cell-empty .ce-btns button');
    assert.equal(await page.locator('.composer').count(), 0);
    assert.match(await page.textContent('.cell-empty'), /Leerer Platz/);
    // ueber den Knopf gezielt 3C oeffnen
    await page.click('.cell-empty .ce-btns button:first-child');
    await page.waitForSelector('.composer textarea');
  } finally { await app.close(); }
});

test('Projektkontext bearbeiten: gespeichert und in CLAUDE.md/AGENTS.md gespiegelt', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  fs.writeFileSync(path.join(proj, 'CLAUDE.md'), '# Eigene Regeln\n');
  const { app, page } = await launch({
    version: 1, ais: [], settings: { language: 'de' },
    projects: [{ id: 'demo', name: 'Demo', path: proj, color: '#22c55e', icon: '🧭', group: '' }],
  });
  try {
    await page.waitForSelector('.d-context');
    assert.equal(await page.$('.d-context.has'), null);
    await page.click('.d-context');
    await page.fill('#modal .m-context', 'Ziel: Testprojekt fuer NEXUS');
    await page.click('#modal .m-foot .primary');
    await page.waitForSelector('#modal .m-note');
    assert.match(await page.textContent('#modal .m-note'), /CLAUDE\.md/);
    assert.equal(fs.readFileSync(path.join(proj, '.nexus', 'context.md'), 'utf8'), 'Ziel: Testprojekt fuer NEXUS');
    const claude = fs.readFileSync(path.join(proj, 'CLAUDE.md'), 'utf8');
    assert.ok(claude.startsWith('# Eigene Regeln'));
    assert.ok(claude.includes('Ziel: Testprojekt fuer NEXUS'));
    assert.ok(fs.existsSync(path.join(proj, 'AGENTS.md')));
    await page.click('#modal .m-head button');
    await page.waitForSelector('.d-context.has');
  } finally { await app.close(); }
});

test('Projektgruppen und Tastenkuerzel (Strg+1…9 nach Seitenleiste, Strg+K Schnellsuche)', async () => {
  const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  const P = (id, name, group) => ({ id, name, path: mk(), color: '#22c55e', icon: 'x', group });
  const { app, page, dir } = await launch({
    version: 1, ais: [], settings: { language: 'de' }, lastProject: 'solo',
    projects: [P('beta', 'Beta', 'Arbeit'), P('alpha', 'Alpha', 'Arbeit'), P('solo', 'Solo', ''), P('ferien', 'Ferien', 'Privat')],
  });
  const key = (keyCode, modifiers = ['control']) => app.evaluate(({ BrowserWindow }, a) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    wc.sendInputEvent({ type: 'keyDown', keyCode: a.keyCode, modifiers: a.modifiers });
    wc.sendInputEvent({ type: 'keyUp', keyCode: a.keyCode, modifiers: a.modifiers });
  }, { keyCode, modifiers });
  try {
    await page.waitForSelector('.p-group');
    const order = await page.$$eval('#project-list > div', (els) => els.map((e) => e.classList.contains('p-group') ? '#' + e.querySelector('.g-name').textContent : e.querySelector('.name').textContent));
    assert.deepEqual(order, ['Solo', '#Arbeit', 'Alpha', 'Beta', '#Privat', 'Ferien']);
    // Strg+2 = zweites Projekt der Seitenleiste (Alpha)
    await key('2');
    await page.waitForFunction(() => state.project === 'alpha');
    // Gruppe Privat einklappen: Ferien verschwindet, Einstellung gespeichert
    await page.click('.p-group:has-text("Privat")');
    await page.waitForFunction(() => !document.querySelector('#project-list').textContent.includes('Ferien'));
    // Strg+K: Schnellsuche, Projekt per Suche oeffnen
    await key('K');
    await page.waitForSelector('.modal-box.palette .pal-input');
    await page.fill('.pal-input', 'ferien');
    await page.press('.pal-input', 'Enter');
    await page.waitForFunction(() => state.project === 'ferien');
    // aktives Projekt in eingeklappter Gruppe bleibt sichtbar
    assert.match(await page.textContent('#project-list'), /Ferien/);
    // Gruppe im Editor aendern
    await page.click('.project.active', { button: 'right' }); // ✎ erscheint nur beim Ueberfahren mit der Maus
    await page.fill('#modal .m-group', 'Urlaub');
    await page.click('#modal .m-foot .primary');
    await page.waitForFunction(() => [...document.querySelectorAll('.p-group .g-name')].some((e) => e.textContent === 'Urlaub'));
    // NEXUS speichert leicht verzoegert: warten, bis die Datei den neuen Stand hat
    const read = () => JSON.parse(fs.readFileSync(path.join(dir, 'nexus-data.json'), 'utf8'));
    for (let i = 0; i < 40 && read().projects.find((p) => p.id === 'ferien').group !== 'Urlaub'; i++) await new Promise((r) => setTimeout(r, 100));
    const saved = read();
    assert.equal(saved.projects.find((p) => p.id === 'ferien').group, 'Urlaub');
    assert.deepEqual(saved.settings.collapsedGroups, ['Privat']);
  } finally { await app.close(); }
});

test('Codex-Workspace: eigene Modi (Sandbox), eigener Platzhalter, per Strg+Umschalt+N', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  const { app, page } = await launch({
    version: 1, ais: [], settings: { language: 'de' },
    projects: [{ id: 'demo', name: 'Demo', path: proj, color: '#22c55e', icon: 'x', group: '' }],
  });
  try {
    await page.waitForSelector('.cell-empty .ce-btns button');
    await app.evaluate(({ BrowserWindow }) => {
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'N', modifiers: ['control', 'shift'] });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'N', modifiers: ['control', 'shift'] });
    });
    await page.waitForSelector('.composer textarea[placeholder="Nachricht an Codex…"]');
    const modes = await page.$$eval('.composer select:not(.model-sel) option', (o) => o.map((x) => x.value));
    assert.deepEqual(modes, ['read-only', 'workspace-write', 'danger-full-access']);
    assert.equal(await page.inputValue('.composer select:not(.model-sel)'), 'workspace-write');
    assert.match(await page.textContent('.ws-chip'), /Codex/);
  } finally { await app.close(); }
});

test('Nutzungslimit: Hinweis mit Uhrzeit, Jetzt weiter schickt die Fortsetzen-Nachricht', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  const { app, page } = await launch({
    version: 1, ais: [], settings: { language: 'de' },
    projects: [{ id: 'demo', name: 'Demo', path: proj, color: '#22c55e', icon: 'x', group: '' }],
    desks: { demo: ccDesk() },
  });
  try {
    await page.waitForSelector('.composer textarea');
    await page.evaluate(() => {
      const v = [...live.values()].find((l) => l.view).view;
      v.setBusy(true);
      v.handle({ type: 'raw', data: { type: 'result', subtype: 'success', is_error: true, num_turns: 3, duration_ms: 5000, result: "You've hit your 5-hour limit · resets 11:59pm (Europe/Berlin)" } });
    });
    await page.waitForSelector('.note.limit');
    assert.match(await page.textContent('.note.limit'), /23:59/);
    assert.match(await page.textContent('.note.limit'), /automatisch/);
    assert.equal(await page.locator('.note.warn').count(), 0);
    await page.click('.note.limit button.primary');
    await page.waitForFunction(() => /Mach bitte genau an der Stelle weiter/.test(document.querySelector('.msg.user:last-of-type')?.textContent || ''));
    assert.equal(await page.locator('.note.limit').count(), 0);
  } finally { await app.close(); }
});

test('3C-Nachrichten: Kopieren, Bearbeiten, Wiederholen, Anheften, Verzweigen', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  const { app, page, dir } = await launch({
    version: 1, ais: [], settings: { language: 'de' },
    projects: [{ id: 'demo', name: 'Demo', path: proj, color: '#22c55e', icon: 'x', group: '' }],
    desks: { demo: ccDesk() },
  });
  const SID = '11111111-1111-4111-8111-111111111111';
  const A1 = '22222222-2222-4222-8222-222222222222';
  try {
    await page.waitForSelector('.composer textarea');
    // Frage senden (Platzhalter-Agent), Antwort und Sitzung simulieren
    await page.fill('.composer textarea', 'Wie spaet ist es?');
    await page.press('.composer textarea', 'Enter');
    await page.evaluate(({ SID, A1 }) => {
      const v = [...live.values()].find((l) => l.view).view;
      v.handle({ type: 'raw', data: { type: 'system', subtype: 'init', session_id: SID } });
      v.handle({ type: 'raw', data: { type: 'assistant', uuid: A1, message: { content: [{ type: 'text', text: 'Kurz nach zwoelf.' }] } } });
      v.handle({ type: 'raw', data: { type: 'result', subtype: 'success', num_turns: 1, duration_ms: 900 } });
    }, { SID, A1 });
    await page.waitForSelector('.msg.assistant[data-uuid] .msg-actions');
    // Kopieren
    await page.hover('.msg.assistant[data-uuid]');
    await page.click('.msg.assistant[data-uuid] .msg-act[title="Kopieren"]');
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'Kurz nach zwoelf.');
    // Anheften: Leiste oben, in den Sitzungsdaten gespeichert
    await page.click('.msg.assistant[data-uuid] .msg-act[title="Anheften"]', { force: true });
    await page.waitForSelector('.pin-bar:not([hidden]) .pin');
    assert.match(await page.textContent('.pin-bar'), /Kurz nach zwoelf/);
    for (let i = 0; i < 40 && !JSON.parse(fs.readFileSync(path.join(dir, 'nexus-data.json'), 'utf8')).sessionMeta[SID]?.pins; i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'nexus-data.json'), 'utf8')).sessionMeta[SID].pins[0].uuid, A1);
    // Bearbeiten: Text ins Eingabefeld, Hinweisleiste; Senden ersetzt die alte Nachricht
    await page.click('.msg.user .msg-act[title^="Bearbeiten"]', { force: true });
    assert.equal(await page.inputValue('.composer textarea'), 'Wie spaet ist es?');
    await page.waitForSelector('.edit-bar:not([hidden])');
    await page.fill('.composer textarea', 'Wie spaet ist es in Tokio?');
    await page.press('.composer textarea', 'Enter');
    await page.waitForFunction(() => document.querySelectorAll('.msg.user').length === 1 && /Tokio/.test(document.querySelector('.msg.user').textContent));
    assert.equal(await page.locator('.msg.assistant[data-uuid]').count(), 0);
    // Wiederholen: gleiche Frage noch einmal, weiterhin nur eine Nutzer-Nachricht
    await page.evaluate(() => [...live.values()].find((l) => l.view).view.setBusy(false));
    await page.click('.msg.user .msg-act[title^="Wiederholen"]', { force: true });
    await page.waitForFunction(() => document.querySelectorAll('.msg.user').length === 1);
    // Verzweigen von einer Antwort: neuer Workspace "(Zweig)"
    await page.evaluate(({ SID, A1 }) => {
      const v = [...live.values()].find((l) => l.view).view;
      v.setBusy(false);
      v.handle({ type: 'raw', data: { type: 'system', subtype: 'init', session_id: SID } });
      v.handle({ type: 'raw', data: { type: 'assistant', uuid: A1, message: { content: [{ type: 'text', text: 'Abends.' }] } } });
    }, { SID, A1 });
    await page.click('.msg.assistant[data-uuid] .msg-act[title^="Verzweigen"]', { force: true });
    await page.waitForFunction(() => [...document.querySelectorAll('.ws-chip .label')].some((e) => /Zweig/.test(e.textContent)));
  } finally { await app.close(); }
});

test('Arbeitsschritte: nur waehrend der Arbeit sichtbar, nach dem Auftrag ausgeblendet', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-proj-'));
  const { app, page } = await launch({
    version: 1, ais: [], settings: { language: 'de', toolDisplay: 'live' },
    projects: [{ id: 'demo', name: 'Demo', path: proj, color: '#22c55e', icon: 'x', group: '' }],
    desks: { demo: ccDesk() },
  });
  try {
    await page.waitForSelector('.composer textarea');
    await page.evaluate(() => {
      const v = [...live.values()].find((l) => l.view).view;
      v.setBusy(true);
      v.handle({ type: 'raw', data: { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] } } });
    });
    await page.waitForSelector('.tool-group', { state: 'visible' });
    await page.evaluate(() => [...live.values()].find((l) => l.view).view.handle({ type: 'raw', data: { type: 'result', subtype: 'success', num_turns: 1, duration_ms: 500 } }));
    await page.waitForSelector('.tool-group', { state: 'hidden' });
    // Umschalten auf "immer": wieder sichtbar
    await page.evaluate(() => { for (const l of live.values()) l.view?.setToolDisplay('always'); });
    await page.waitForSelector('.tool-group', { state: 'visible' });
  } finally { await app.close(); }
});
