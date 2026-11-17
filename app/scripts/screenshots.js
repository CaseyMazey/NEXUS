// Screenshots fuer die README aus der echten App – mit erfundenen Demo-Projekten, nie mit echten Daten.
//   npm run screenshots          -> docs/screenshots/*.png
// Die Web-KIs sind im Demo-Ordner nicht angemeldet und zeigen ihre Startseite. Das Gespraech in 3C ist
// ein eingespieltes Beispiel (es wird nichts an Claude gesendet).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

const APP = path.join(__dirname, '..');
const OUT = path.join(APP, '..', 'docs', 'screenshots');
const W = 1440;
const H = 880;

// ---------- Demo-Daten ----------
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-demo-'));
const projRoot = path.join(root, 'Projekte');
const dataDir = path.join(root, 'daten');
const P = [
  ['reiseplaner', 'Reiseplaner', '🧭', '#06b6d4'],
  ['portfolio', 'Portfolio-Website', '🌐', '#6366f1'],
  ['masterarbeit', 'Masterarbeit', '📚', '#22c55e'],
  ['smarthome', 'Smart Home', '🏡', '#f59e0b'],
  ['rezepte', 'Rezeptbuch', '🔥', '#ef4444'],
];
fs.mkdirSync(dataDir, { recursive: true });
for (const [, name] of P) fs.mkdirSync(path.join(projRoot, name), { recursive: true });
fs.mkdirSync(path.join(projRoot, 'Reiseplaner', '.nexus'), { recursive: true });
const CONTEXT = '## Ziel\n10 Tage Japan im April 2027 (Tokio, Kyoto, Osaka), zu zweit, mittleres Budget.\n\n## Stand\nFlüge gebucht (Frankfurt–Tokio, 3.–13. April). Unterkünfte noch offen.\n\n## Regeln\n- Antworten auf Deutsch, Preise in Euro\n- Lieber weniger Orte, dafür entspannt\n- Keine Buchungen ohne Rückfrage';
fs.writeFileSync(path.join(projRoot, 'Reiseplaner', '.nexus', 'context.md'), CONTEXT);

const ws = (id, type, title) => ({ id, type, title, sessionId: null, url: null });
const data = {
  version: 1,
  projects: P.map(([id, name, icon, color]) => ({ id, name, path: path.join(projRoot, name), color, icon, group: '' })),
  desks: {
    reiseplaner: { layout: 3, focus: 0, cells: ['ws-cc-reise', 'ws-claude-r', 'ws-gpt-reise', null],
      workspaces: [ws('ws-cc-reise', 'claude-code', 'Route Japan im April'), ws('ws-claude-r', 'claude', 'Claude'), ws('ws-gpt-reise', 'chatgpt', 'ChatGPT'), ws('ws-gem-reise', 'gemini', 'Gemini')] },
    portfolio: { layout: 1, focus: 0, cells: ['ws-cc-port', null, null, null], workspaces: [ws('ws-cc-port', 'claude-code', 'Kontaktformular')] },
    masterarbeit: { layout: 1, focus: 0, cells: ['ws-cc-ma', null, null, null], workspaces: [ws('ws-cc-ma', 'claude-code', 'Literaturliste')] },
  },
  ais: [{ id: 'claude' }, { id: 'chatgpt' }, { id: 'gemini' }],
  sessionMeta: {}, slashCommands: ['clear', 'compact', 'context', 'model'],
  lastProject: 'reiseplaner',
  settings: { language: 'de', theme: 'kupfer', lightTheme: 'creme', darkTheme: 'kupfer', chatMode: 'pushOnly', projectRoot: projRoot, notify: true, confirmRemove: true, autoUpdate: true },
};
fs.writeFileSync(path.join(dataDir, 'nexus-data.json'), JSON.stringify(data, null, 2));

// Beispielgespraech fuer 3C
const now = Date.now();
const EXAMPLE = [
  { kind: 'user', ts: now - 6 * 60000, text: 'Plane uns eine entspannte 10-Tage-Route durch Japan im April – Tokio, Kyoto, Osaka. Bitte als Tabelle, und sag mir, ob sich der Japan Rail Pass lohnt.' },
  { kind: 'tool', ts: now - 5.8 * 60000, id: 't1', name: 'Read', input: { file_path: 'reiseplan.md' }, result: '…' },
  { kind: 'tool', ts: now - 5.5 * 60000, id: 't2', name: 'WebSearch', input: { query: 'Kirschblüte Kyoto April 2027 Prognose' }, result: '…' },
  { kind: 'tool', ts: now - 4.9 * 60000, id: 't3', name: 'WebSearch', input: { query: 'Japan Rail Pass Preis 7 Tage 2027' }, result: '…' },
  { kind: 'tool', ts: now - 4.2 * 60000, id: 't4', name: 'Write', input: { file_path: 'route-japan.md' }, result: 'Datei erstellt' },
  { kind: 'assistant', ts: now - 4 * 60000, endTs: now - 4 * 60000, text: 'Hier ist euer Vorschlag – mit Puffertagen, damit es entspannt bleibt. Ich habe ihn auch in `route-japan.md` gespeichert.\n\n| Tage | Ort | Highlights |\n|---|---|---|\n| 1–4 | **Tokio** | Asakusa, Shibuya, Tagesausflug nach Nikko |\n| 5–8 | **Kyoto** | Fushimi Inari früh morgens, Philosophenweg zur Kirschblüte |\n| 9–10 | **Osaka** | Dotonbori, Streetfood, Abflug ab Kansai |\n\n**Japan Rail Pass:** Für diese Route lohnt er sich eher **nicht**. Tokio → Kyoto → Osaka kostet einzeln rund 120 €, der 7-Tage-Pass liegt bei etwa 300 €. Holt euch lieber eine IC-Karte (Suica) für U-Bahn und Busse.\n\nSoll ich als Nächstes passende Unterkünfte in Kyoto heraussuchen?' },
];
const FAKE_SESSIONS = [
  { id: '11111111-1111-4111-8111-111111111111', title: 'Route Japan im April', prompts: 6, updated: now - 4 * 60000 },
  { id: '22222222-2222-4222-8222-222222222222', title: 'Budget und Packliste', prompts: 11, updated: now - 3 * 3600000 },
  { id: '33333333-3333-4333-8333-333333333333', title: 'Unterkünfte Tokio vergleichen', prompts: 4, updated: now - 2 * 86400000 },
];

// Cookie-Hinweise der KI-Seiten in den frischen Demo-Sitzungen ablehnen (nur hier im Skript,
// wie es ein Mensch tun wuerde; die App selbst greift nie in Anbieterseiten ein)
async function declineCookies(app) {
  return app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    let n = 0;
    for (const v of w.contentView.children) {
      if (!v.webContents) continue;
      n += await v.webContents.executeJavaScript(`(() => {
        const re = /^(Ablehnen|Alle ablehnen|Nicht unbedingt erforderliche ablehnen|Reject all|Reject non-essential)$/i;
        const b = [...document.querySelectorAll('button, [role=button]')].find((x) => re.test((x.innerText || '').trim()));
        if (b) { b.click(); return 1; } return 0; })()`).catch(() => 0);
    }
    return n;
  });
}

// ---------- Aufnahme ----------
async function shot(app, page, name) {
  await page.waitForTimeout(600);
  // Hauptfenster und eingebettete KI-Seiten getrennt aufnehmen und zusammensetzen
  const parts = await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'NEXUS');
    const main = await win.webContents.capturePage();
    const views = [];
    for (const v of win.contentView.children) {
      if (!v.webContents || !v.getVisible?.()) continue;
      const img = await v.webContents.capturePage();
      views.push({ url: img.toDataURL(), b: v.getBounds() });
    }
    return { main: main.toDataURL(), views };
  });
  const png = await page.evaluate(async ({ main, views }) => {
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    const base = await load(main);
    const c = document.createElement('canvas');
    c.width = base.width; c.height = base.height;
    const g = c.getContext('2d');
    g.drawImage(base, 0, 0);
    const k = base.width / window.innerWidth;
    for (const v of views) g.drawImage(await load(v.url), v.b.x * k, v.b.y * k, v.b.width * k, v.b.height * k);
    return c.toDataURL('image/png').split(',')[1];
  }, parts);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(png, 'base64'));
  console.log('gespeichert:', name);
}

(async () => {
  const app = await electron.launch({ executablePath: require('electron'), args: [APP, `--nexus-data=${dataDir}`] });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }, s) => { const w = BrowserWindow.getAllWindows()[0]; w.unmaximize(); w.setContentSize(s.w, s.h); w.center(); }, { w: W, h: H });
  await page.waitForSelector('body[data-ready="1"]');
  await page.waitForSelector('.composer textarea');
  // Beispielinhalte: Gespraech, Sitzungsliste, Status anderer Projekte
  await page.evaluate(({ example, sessions }) => {
    const l = [...live.values()].find((x) => x.view && x.projectId === 'reiseplaner');
    l.view.showExample(example);
    state.sessions = sessions;
    renderSessions();
    // Portfolio: KI arbeitet gerade; Masterarbeit: fertig, noch nicht angesehen
    live.set('demo-busy', { type: 'claude-code', projectId: 'portfolio', busy: true, body: document.createElement('div') });
    live.set('demo-done', { type: 'claude-code', projectId: 'masterarbeit', done: true, body: document.createElement('div') });
    renderProjects();
  }, { example: EXAMPLE, sessions: FAKE_SESSIONS });
  // Web-KIs laden lassen (claude.ai braucht im Firmennetz laenger); warten, bis Claude etwas zeigt
  await page.waitForTimeout(8000);
  for (let i = 0; i < 20; i++) {
    const ok = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return w.contentView.children.filter((v) => v.webContents && v.getVisible()).every((v) => !v.webContents.isLoading()); });
    if (ok) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(4000);
  for (let i = 0; i < 3; i++) { await declineCookies(app); await page.waitForTimeout(2500); }

  // 1) Ueberblick: Desk mit drei KIs nebeneinander, dunkles Theme
  await shot(app, page, 'desk-dunkel.png');

  // 2) 3C gross, helles Theme
  await page.evaluate(async () => { await setTheme('creme'); setLayout(1); placeInFocus('ws-cc-reise'); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const l = [...live.values()].find((x) => x.view && x.projectId === 'reiseplaner'); l.view.scrollDown(); });
  await shot(app, page, '3c-chat.png');

  // 3) Zwei nebeneinander, hell: 3C und Gemini
  await page.evaluate(() => { const d = desk(); d.cells = ['ws-cc-reise', 'ws-gem-reise', null, null]; setLayout(2); });
  await page.waitForTimeout(8000);
  for (let i = 0; i < 3; i++) { await declineCookies(app); await page.waitForTimeout(2500); }
  await shot(app, page, 'desk-hell.png');

  // 4) Projektkontext
  await page.evaluate(() => { setLayout(1); placeInFocus('ws-cc-reise'); openContextEditor(project('reiseplaner')); });
  await shot(app, page, 'projektkontext.png');
  await page.evaluate(() => closeModal());

  // 5) Meine KIs
  await page.evaluate(() => openAiManager());
  await shot(app, page, 'meine-kis.png');
  await page.evaluate(() => closeModal());

  // 6) Einstellungen (neutraler Pfad statt des echten Benutzerordners)
  await page.evaluate(() => { state.projectRoot = 'C:\\Users\\Du\\Documents\\Projekte'; openSettings(); });
  await shot(app, page, 'einstellungen.png');

  await app.close();
  fs.rmSync(root, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
