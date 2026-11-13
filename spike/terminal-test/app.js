/* global Terminal, FitAddon, NexusChat */
// NEXUS Oberflaeche: Projekte, Desks (Workspaces im Raster), Claude-Code-Sitzungen.
const $ = (s) => document.querySelector(s);
const WS_INFO = {
  'claude-code': { label: 'Claude Code', icon: '✳️', color: '#d97757', kind: 'chat' },
  'claude-code-term': { label: 'Claude Code (Terminal)', icon: '⌨', color: '#d97757', kind: 'term' },
  claude: { label: 'Claude', icon: '💬', color: '#c96442', kind: 'web' },
  chatgpt: { label: 'ChatGPT', icon: '🟢', color: '#10a37f', kind: 'web' },
  gemini: { label: 'Gemini', icon: '✦', color: '#4285f4', kind: 'web' },
};
const state = {
  projects: [], sessionMeta: {}, desks: {}, slashCommands: [], palette: [], icons: [],
  project: null, sessions: [], filterColor: null, search: '', usage: null,
};
const live = new Map(); // wsId -> { type, projectId, body, view?, term?, fit?, termId?, busy, waiting, webState }

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}
const uid = () => 'ws-' + Math.random().toString(36).slice(2, 10);
const project = (id = state.project) => state.projects.find((p) => p.id === id);
function relTime(ms) {
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return 'gerade eben';
  if (d < 3600) return `vor ${Math.floor(d / 60)} Min.`;
  if (d < 86400) return `vor ${Math.floor(d / 3600)} Std.`;
  if (d < 86400 * 7) return `vor ${Math.floor(d / 86400)} Tg.`;
  return new Date(ms).toLocaleDateString('de-DE');
}

// ---------- Desk-Daten ----------
function desk(pid = state.project) {
  if (!state.desks[pid]) {
    const id = uid();
    state.desks[pid] = { layout: 1, cells: [id, null, null, null], focus: 0, workspaces: [{ id, type: 'claude-code', title: 'Claude Code', sessionId: null, url: null }] };
  }
  return state.desks[pid];
}
const wsById = (id, d = desk()) => d.workspaces.find((w) => w.id === id);
let saveTimer;
function saveDesk() {
  const pid = state.project;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await window.nexus.saveDesk(pid, state.desks[pid]);
    const s = $('#saved');
    s.textContent = '✓ Desk gespeichert';
    s.classList.add('on');
    setTimeout(() => s.classList.remove('on'), 1400);
  }, 250);
}

// ---------- Overlays (Web-Ansichten liegen nativ ueber dem DOM -> beim Oeffnen ausblenden) ----------
let overlayOpen = false;
function openOverlay(anchor, nodes) {
  const pop = $('#popover');
  pop.replaceChildren(...nodes);
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.min(r.left, innerWidth - 280)}px`;
  pop.style.top = `${r.bottom + 6}px`;
  pop.hidden = false;
  overlayOpen = true;
  window.nexus.webHideAll();
}
function closeOverlay() {
  if (!overlayOpen) return;
  $('#popover').hidden = true;
  overlayOpen = false;
  layoutWeb();
}
document.addEventListener('click', (e) => { if (!$('#popover').contains(e.target)) closeOverlay(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlay(); });
function swatchOverlay(anchor, colors, onPick, withNone) {
  const opts = (withNone ? [{ none: true, c: '#2a2d37' }] : []).concat(colors.map((c) => ({ c })));
  openOverlay(anchor, [el('div', { class: 'swatches' }, ...opts.map((o) => el('button', {
    class: 'opt', title: o.none ? 'keine' : o.c, style: { background: o.c },
    onclick: (e) => { e.stopPropagation(); closeOverlay(); onPick(o.none ? null : o.c); },
  })))]);
}

// ---------- Projekte ----------
function renderProjects() {
  $('#project-list').replaceChildren(...state.projects.map((p) => {
    const d = state.desks[p.id];
    const count = d ? d.workspaces.length : 0;
    return el('div', { class: 'project' + (p.id === state.project ? ' active' : ''), style: { '--pc': p.color }, onclick: () => selectProject(p.id) },
      el('span', { class: 'icon' }, p.icon), el('span', { class: 'name' }, p.name),
      count ? el('span', { class: 'count', title: 'Workspaces im Desk' }, String(count)) : null);
  }));
}
async function selectProject(id) {
  if (state.project === id) return;
  state.project = id;
  const p = project();
  document.body.style.setProperty('--pc', p.color);
  renderProjects();
  renderDesk();
  saveDesk();
  $('#session-list').replaceChildren(el('div', { class: 'side-note' }, 'Lädt…'));
  state.sessions = await window.nexus.listSessions(id);
  renderSessions();
}
async function refreshSessions() {
  if (!state.project) return;
  state.sessions = await window.nexus.listSessions(state.project);
  renderSessions();
}

// ---------- Sitzungsliste ----------
function renderSessions() {
  const chips = [el('span', { class: 'chip all' + (state.filterColor ? '' : ' on'), title: 'Alle', onclick: () => { state.filterColor = null; renderSessions(); } })];
  for (const c of state.palette) chips.push(el('span', { class: 'chip' + (state.filterColor === c ? ' on' : ''), style: { background: c }, title: 'Nur diese Farbe', onclick: () => { state.filterColor = state.filterColor === c ? null : c; renderSessions(); } }));
  $('#color-filter').replaceChildren(...chips);
  const q = state.search.toLowerCase();
  const inDesk = new Set(desk().workspaces.map((w) => w.sessionId).filter(Boolean));
  const list = state.sessions.filter((s) => (!state.filterColor || state.sessionMeta[s.id]?.color === state.filterColor) && (!q || s.title.toLowerCase().includes(q)));
  const row = (s) => {
    const meta = state.sessionMeta[s.id] || {};
    const colorBtn = el('button', { title: 'Farbe markieren' }, '🎨');
    colorBtn.onclick = (e) => { e.stopPropagation(); swatchOverlay(colorBtn, state.palette, async (c) => { state.sessionMeta[s.id] = await window.nexus.updateSessionMeta(s.id, { color: c }); renderSessions(); }, true); };
    const pinBtn = el('button', { title: meta.pinned ? 'Lösen' : 'Anheften' }, meta.pinned ? '📌' : '📍');
    pinBtn.onclick = async (e) => { e.stopPropagation(); state.sessionMeta[s.id] = await window.nexus.updateSessionMeta(s.id, { pinned: !meta.pinned }); renderSessions(); };
    return el('div', { class: 'session' + (inDesk.has(s.id) ? ' open' : ''), style: { '--sc': meta.color || 'transparent' }, title: 'In den aktiven Platz laden: ' + s.title, onclick: () => openSessionInDesk(s) },
      el('div', { class: 'title' }, (meta.pinned ? '📌 ' : '') + s.title),
      el('div', { class: 'meta' }, `${relTime(s.updated)} · ${s.prompts} Prompts`),
      el('div', { class: 'actions' }, colorBtn, pinBtn));
  };
  const pinned = list.filter((s) => state.sessionMeta[s.id]?.pinned);
  const rest = list.filter((s) => !state.sessionMeta[s.id]?.pinned);
  const out = [];
  if (pinned.length) out.push(el('div', { class: 'side-note' }, 'Angeheftet'), ...pinned.map(row));
  out.push(...rest.map(row));
  if (!state.sessions.length) out.push(el('div', { class: 'side-note' }, 'Noch keine Sitzungen.'));
  $('#session-list').replaceChildren(...out);
}
$('#search').addEventListener('input', (e) => { state.search = e.target.value; renderSessions(); });

function openSessionInDesk(s) {
  const d = desk();
  const existing = d.workspaces.find((w) => w.type === 'claude-code' && w.sessionId === s.id);
  if (existing) { placeInFocus(existing.id); return; }
  addWorkspace('claude-code', { sessionId: s.id, title: s.title });
}

// ---------- Workspaces ----------
function addWorkspace(type, extra = {}) {
  const d = desk();
  const ws = { id: uid(), type, title: extra.title || WS_INFO[type].label, sessionId: extra.sessionId || null, url: null };
  d.workspaces.push(ws);
  // freie sichtbare Zelle bevorzugen, sonst die fokussierte
  const free = d.cells.slice(0, d.layout).findIndex((c) => !c);
  const idx = free >= 0 ? free : d.focus;
  d.cells[idx] = ws.id;
  d.focus = idx;
  renderDesk(); saveDesk(); renderProjects();
  return ws;
}
function placeInFocus(wsId) {
  const d = desk();
  const cur = d.cells.slice(0, d.layout).indexOf(wsId);
  if (cur >= 0) { d.focus = cur; renderDesk(); saveDesk(); return; }
  d.cells[d.focus] = wsId;
  renderDesk(); saveDesk();
}
function removeWorkspace(wsId) {
  const d = desk();
  const ws = wsById(wsId);
  if (!ws) return;
  if (!confirm(`„${ws.title}“ aus dem Desk entfernen?\n(Der Chat selbst bleibt beim Anbieter bzw. in Claude Code erhalten.)`)) return;
  destroyLive(wsId);
  d.workspaces = d.workspaces.filter((w) => w.id !== wsId);
  d.cells = d.cells.map((c) => (c === wsId ? null : c));
  renderDesk(); saveDesk(); renderProjects(); renderSessions();
}
function destroyLive(wsId) {
  const l = live.get(wsId);
  if (!l) return;
  if (l.view) l.view.destroy();
  if (l.term) { if (l.termId) window.nexus.kill(l.termId); l.term.dispose(); }
  if (WS_INFO[l.type].kind === 'web') window.nexus.webDestroy(wsId);
  l.body.remove();
  live.delete(wsId);
}

// Live-Instanz eines Workspaces holen oder anlegen (laeuft weiter, auch wenn unsichtbar).
function ensureLive(ws, pid) {
  if (live.has(ws.id)) return live.get(ws.id);
  const p = project(pid);
  const kind = WS_INFO[ws.type].kind;
  const body = el('div', { class: 'ws-body ' + kind });
  const l = { type: ws.type, projectId: pid, body, busy: false, waiting: false, webState: {} };
  live.set(ws.id, l);
  if (kind === 'chat') {
    l.view = NexusChat.create(body, {
      project: p, sessionId: ws.sessionId,
      getSlashCommands: () => state.slashCommands,
      onSession: (id) => { ws.sessionId = id; saveDeskFor(pid); refreshSessionsIf(pid); },
      onTitle: (t) => { ws.title = t; saveDeskFor(pid); renderChrome(); },
      onBusy: (b) => { l.busy = b; renderChrome(); },
      onWaiting: (b) => { l.waiting = b; renderChrome(); },
      onUsage: (info) => { state.usage = info; for (const x of live.values()) x.view?.setUsage(info); },
      onTurnDone: () => refreshSessionsIf(pid),
    });
    if (state.usage) l.view.setUsage(state.usage);
  } else if (kind === 'term') {
    const term = new Terminal({ fontFamily: 'Cascadia Mono, Consolas, monospace', fontSize: 13, cursorBlink: true,
      theme: { background: '#111216', foreground: '#e7e8ec', cursor: p.color, selectionBackground: p.color + '55' } });
    const fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    l.term = term; l.fit = fit;
    l.startTerm = async () => {
      if (l.termId || l.starting) return;
      l.starting = true;
      term.open(body); fit.fit();
      l.termId = await window.nexus.openTerminal({ projectId: pid, resumeId: ws.sessionId, cols: term.cols, rows: term.rows });
      term.onData((x) => window.nexus.input(l.termId, x));
      term.onResize(({ cols, rows }) => window.nexus.resize(l.termId, cols, rows));
    };
  } else {
    window.nexus.webEnsure(ws.id, ws.type, ws.url);
  }
  return l;
}
function saveDeskFor(pid) { if (pid === state.project) saveDesk(); else window.nexus.saveDesk(pid, state.desks[pid]); }
function refreshSessionsIf(pid) { if (pid === state.project) refreshSessions(); }

// ---------- Desk zeichnen ----------
function renderDesk() {
  const d = desk();
  const p = project();
  // Kopf
  const icon = el('span', { class: 'd-icon', title: 'Icon ändern' }, p.icon);
  icon.onclick = (e) => {
    e.stopPropagation();
    openOverlay(icon, [el('div', { class: 'emojis' }, ...state.icons.map((t) => el('button', { class: 'emoji', onclick: async (ev) => {
      ev.stopPropagation(); closeOverlay(); Object.assign(p, await window.nexus.updateProject(p.id, { icon: t })); renderProjects(); renderDesk();
    } }, t)))]);
  };
  const sw = el('span', { class: 'd-swatch', title: 'Projektfarbe', style: { background: p.color } });
  sw.onclick = (e) => { e.stopPropagation(); swatchOverlay(sw, state.palette, async (c) => { Object.assign(p, await window.nexus.updateProject(p.id, { color: c })); document.body.style.setProperty('--pc', p.color); renderProjects(); renderDesk(); }); };
  $('#desk-title').replaceChildren(icon, el('span', { class: 'd-name' }, p.name), sw);
  // Raster-Knoepfe
  $('#layouts').replaceChildren(...[1, 2, 3, 4].map((n) => el('button', { class: 'lay' + (d.layout === n ? ' on' : ''), title: `${n} nebeneinander`, onclick: () => setLayout(n) }, layoutIcon(n))));
  renderChrome();
  // Zellen
  const grid = $('#grid');
  grid.className = 'layout-' + d.layout;
  // alle DOM-Workspaces erst parken
  for (const l of live.values()) if (WS_INFO[l.type].kind !== 'web') $('#parking').append(l.body);
  const cells = [];
  for (let i = 0; i < d.layout; i++) {
    const ws = d.cells[i] ? wsById(d.cells[i]) : null;
    cells.push(renderCell(i, ws));
  }
  grid.replaceChildren(...cells);
  // Web-Ansichten anderer Desks ausblenden, sichtbare positionieren
  requestAnimationFrame(() => { layoutWeb(); fitTerms(); });
}
function layoutIcon(n) {
  const s = el('span', { class: 'lay-ico lay-' + n });
  for (let i = 0; i < n; i++) s.append(el('i'));
  return s;
}
function setLayout(n) {
  const d = desk();
  d.layout = n;
  // Leere sichtbare Zellen mit noch nicht sichtbaren Workspaces auffuellen
  const visible = new Set(d.cells.slice(0, n).filter(Boolean));
  const spare = d.workspaces.filter((w) => !visible.has(w.id));
  for (let i = 0; i < n; i++) if (!d.cells[i] && spare.length) d.cells[i] = spare.shift().id;
  if (d.focus >= n) d.focus = 0;
  renderDesk(); saveDesk();
}
function renderCell(i, ws) {
  const d = desk();
  const cell = el('section', { class: 'cell' + (d.focus === i ? ' focus' : ''), onmousedown: () => { if (d.focus !== i) { d.focus = i; for (const c of document.querySelectorAll('.cell')) c.classList.toggle('focus', c === cell); saveDesk(); } } });
  if (!ws) {
    cell.append(el('div', { class: 'cell-empty' }, el('div', { class: 'ce-title' }, 'Leerer Platz'),
      el('div', { class: 'ce-btns' }, ...Object.entries(WS_INFO).map(([type, info]) => el('button', { onclick: () => { d.focus = i; addWorkspace(type); } }, `${info.icon} ${info.label}`))),
      d.workspaces.length ? el('div', { class: 'ce-sub' }, 'oder oben einen vorhandenen Workspace anklicken') : null));
    return cell;
  }
  const info = WS_INFO[ws.type];
  const l = ensureLive(ws, state.project);
  const head = el('div', { class: 'cell-head', style: { '--wc': info.color } },
    el('span', { class: 'ch-icon' }, info.icon),
    el('span', { class: 'ch-title', title: ws.title }, ws.title),
    el('span', { class: 'ch-type' }, info.label));
  const actions = el('div', { class: 'ch-actions' });
  if (info.kind === 'web') {
    actions.append(el('button', { title: 'Zurück', onclick: () => window.nexus.webNav(ws.id, 'back') }, '←'),
      el('button', { title: 'Neu laden', onclick: () => window.nexus.webNav(ws.id, 'reload') }, '↻'),
      el('button', { title: 'Neuer Chat', onclick: () => window.nexus.webNav(ws.id, 'home') }, '＋'),
      el('button', { title: 'Im Browser öffnen', onclick: () => window.nexus.webNav(ws.id, 'external') }, '⇱'));
  } else {
    actions.append(el('button', { title: 'Neu starten (setzt dieselbe Sitzung fort)', onclick: () => { destroyLive(ws.id); renderDesk(); } }, '↻'));
    if (info.kind === 'chat' && ws.sessionId) actions.append(el('button', { title: 'Im Terminal öffnen', onclick: () => addWorkspace('claude-code-term', { sessionId: ws.sessionId, title: ws.title }) }, '⌨'));
  }
  actions.append(el('button', { title: 'Platz leeren (Workspace bleibt im Desk)', onclick: () => { d.cells[i] = null; renderDesk(); saveDesk(); } }, '▢'));
  head.append(actions);
  cell.append(head);
  if (info.kind === 'web') {
    const slot = el('div', { class: 'ws-body web-slot', 'data-ws': ws.id }, l.webState.error ? el('div', { class: 'web-err' }, l.webState.error) : el('div', { class: 'web-loading' }, 'Lädt…'));
    cell.append(slot);
  } else {
    cell.append(l.body);
    if (info.kind === 'term') requestAnimationFrame(() => l.startTerm());
  }
  return cell;
}
function renderChrome() {
  const d = desk();
  const visible = d.cells.slice(0, d.layout);
  $('#ws-chips').replaceChildren(...d.workspaces.map((w) => {
    const info = WS_INFO[w.type];
    const l = live.get(w.id);
    const x = el('button', { class: 'x', title: 'Aus dem Desk entfernen' }, '×');
    x.onclick = (e) => { e.stopPropagation(); removeWorkspace(w.id); };
    return el('div', { class: 'ws-chip' + (visible.includes(w.id) ? ' shown' : ''), style: { '--wc': info.color }, title: `${info.label}: ${w.title}\nKlick = im aktiven Platz anzeigen`, onclick: () => placeInFocus(w.id) },
      el('span', {}, info.icon), el('span', { class: 'label' }, w.title),
      l?.busy ? el('span', { class: 'busy' }) : null, l?.waiting ? el('span', { class: 'waiting' }, '!') : null, x);
  }));
  // Titel in Zellenkoepfen aktualisieren
  for (const t of document.querySelectorAll('.cell')) {
    const idx = [...t.parentNode.children].indexOf(t);
    const ws = d.cells[idx] && wsById(d.cells[idx]);
    const title = t.querySelector('.ch-title');
    if (ws && title) { title.textContent = ws.title; title.title = ws.title; }
  }
}

// Native Web-Ansichten an die DOM-Platzhalter anpassen
function layoutWeb() {
  if (overlayOpen) return;
  const d = desk();
  const shown = new Set();
  for (const slot of document.querySelectorAll('.web-slot')) {
    const id = slot.dataset.ws;
    const r = slot.getBoundingClientRect();
    window.nexus.webBounds(id, { x: r.left, y: r.top, width: r.width, height: r.height });
    shown.add(id);
  }
  for (const [id, l] of live) if (WS_INFO[l.type].kind === 'web' && !shown.has(id)) window.nexus.webBounds(id, null);
  void d;
}
function fitTerms() { for (const l of live.values()) if (l.term && l.termId && l.body.isConnected) l.fit.fit(); }
new ResizeObserver(() => { layoutWeb(); fitTerms(); }).observe($('#grid'));

window.nexus.onWebState((wsId, s) => {
  const l = live.get(wsId);
  if (!l) return;
  l.webState = { ...l.webState, ...s };
  // Desk finden, zu dem der Workspace gehoert, und Adresse/Titel merken
  const d = state.desks[l.projectId];
  const ws = d && wsById(wsId, d);
  if (!ws) return;
  let changed = false;
  if (s.url && s.url !== ws.url && /^https:\/\//.test(s.url)) { ws.url = s.url; changed = true; }
  if (s.title) {
    // Anbieter-Zusaetze entfernen; Start-/Login-Seiten bekommen den Anbieternamen.
    let t = s.title.replace(/\s*[-|–]\s*(Claude(\.ai)?|ChatGPT|Gemini|Google Gemini)\s*$/i, '').trim();
    if (!t || /^(Claude|ChatGPT|Gemini|Google Gemini|Neue Sitzung|New chat|Neuer Chat)$/i.test(t) || /^ChatGPT:|Anmelden|Log in|Sign in|Konto erstellen/i.test(t)) t = WS_INFO[ws.type].label;
    if (t !== ws.title) { ws.title = t.slice(0, 80); changed = true; }
  }
  if (changed) { saveDeskFor(l.projectId); if (l.projectId === state.project) renderChrome(); }
  const slot = document.querySelector(`.web-slot[data-ws="${wsId}"]`);
  if (slot) slot.replaceChildren(s.error ? el('div', { class: 'web-err' }, s.error + ' – „⇱“ öffnet den Anbieter im Browser.') : el('div', { class: 'web-loading' }, s.loading ? 'Lädt…' : ''));
});

// Terminal-Ereignisse
window.nexus.onData((id, x) => { for (const l of live.values()) if (l.termId === id) l.term.write(x); });
window.nexus.onExit((id, code) => { for (const l of live.values()) if (l.termId === id) l.term.write(`\r\n\x1b[90m[Claude Code beendet, Code ${code}]\x1b[0m\r\n`); });
// Chat-Ereignisse (gepuffert, bis die Ansicht ihre chatId kennt)
const early = new Map();
window.nexus.onChatEvent((chatId, ev) => {
  for (const l of live.values()) if (l.view && l.view.chatId === chatId) return l.view.handle(ev);
  if (!early.has(chatId)) early.set(chatId, []);
  early.get(chatId).push(ev);
});
setInterval(() => {
  for (const [chatId, list] of early) {
    for (const l of live.values()) if (l.view && l.view.chatId === chatId) { early.delete(chatId); list.forEach((ev) => l.view.handle(ev)); }
  }
}, 200);

// ---------- Leiste: Workspace hinzufuegen ----------
$('#add-ws').onclick = (e) => {
  e.stopPropagation();
  openOverlay($('#add-ws'), [el('div', { class: 'menu' }, el('div', { class: 'menu-label' }, 'Workspace hinzufügen'),
    ...Object.entries(WS_INFO).map(([type, info]) => el('button', { class: 'menu-item', style: { '--wc': info.color }, onclick: (ev) => { ev.stopPropagation(); closeOverlay(); addWorkspace(type); } },
      el('span', { class: 'mi-icon' }, info.icon), el('span', {}, info.label),
      el('span', { class: 'mi-sub' }, info.kind === 'web' ? 'Webseite' : info.kind === 'chat' ? 'NEXUS-Chat' : 'Terminal'))))]);
};
$('#open-folder').onclick = () => window.nexus.openFolder(state.project);

// ---------- Start ----------
(async () => {
  Object.assign(state, await window.nexus.getState());
  renderProjects();
  const first = project(state.lastProject) || state.projects.find((p) => p.name === 'NEXUS') || state.projects[0];
  if (first) selectProject(first.id);
})();

// Selbsttest (nur mit --selftest): Desk mit 3 Workspaces im 3er-Raster, ohne etwas zu senden.
window.__nexusSelftest = async () => {
  const p = state.projects.find((x) => x.name === 'NEXUS') || state.projects[0];
  await selectProject(p.id);
  const d = desk();
  d.layout = 3;
  addWorkspace('claude');
  addWorkspace('chatgpt');
  return { project: p.name, layout: d.layout, workspaces: d.workspaces.map((w) => w.type), cells: d.cells };
};
