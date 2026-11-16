/* global Terminal, FitAddon, NexusChat */
// NEXUS Oberflaeche: Projekte, Desks (Workspaces im Raster), Claude-Code-Sitzungen.
const $ = (s) => document.querySelector(s);
const CODE_INFO = {
  'claude-code': { label: 'Claude Code', icon: '✳️', color: '#d97757', kind: 'chat' },
  'claude-code-term': { label: 'Claude Code (Terminal)', icon: '⌨', color: '#d97757', kind: 'term' },
};
// Workspace-Typ -> Anzeige. Web-KIs kommen aus "Meine KIs".
function wsInfo(type) {
  if (CODE_INFO[type]) return CODE_INFO[type];
  const ai = state.ais.find((a) => a.id === type);
  return ai ? { ...ai, kind: 'web' } : { label: 'Entfernte KI', icon: '❔', color: '#555', kind: 'web' };
}
// Was man in einen Desk legen kann: Claude Code + alle aufgenommenen KIs.
const addableTypes = () => [...Object.keys(CODE_INFO), ...state.ais.map((a) => a.id)].map((t) => [t, wsInfo(t)]);
const state = {
  projects: [], sessionMeta: {}, desks: {}, slashCommands: [], palette: [], icons: [],
  project: null, sessions: [], filterColor: null, search: '', usage: null,
  ais: [], catalog: [], aiStatus: {},
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
  const rows = state.projects.map((p) => {
    const d = state.desks[p.id];
    const count = d ? d.workspaces.length : 0;
    const edit = el('button', { class: 'p-edit', title: 'Projekt bearbeiten' }, '✎');
    edit.onclick = (e) => { e.stopPropagation(); openProjectEditor(p); };
    return el('div', { class: 'project' + (p.id === state.project ? ' active' : '') + (p.missing ? ' missing' : ''), style: { '--pc': p.color },
      title: p.missing ? `Ordner nicht gefunden: ${p.path}` : p.path,
      onclick: () => selectProject(p.id), oncontextmenu: (e) => { e.preventDefault(); openProjectEditor(p); } },
      el('span', { class: 'icon' }, p.icon), el('span', { class: 'name' }, p.name),
      p.missing ? el('span', { class: 'p-warn' }, '⚠') : null,
      count ? el('span', { class: 'count', title: 'Workspaces im Desk' }, String(count)) : null, edit);
  });
  $('#project-list').replaceChildren(...(rows.length ? rows : [el('div', { class: 'side-note' }, 'Noch keine Projekte. Lege oben mit ＋ eins an.')]));
}
// Projektliste vom Hauptprozess uebernehmen, dabei Objekte behalten (laufende Chats halten Referenzen)
function setProjects(list) {
  const old = new Map(state.projects.map((p) => [p.id, p]));
  state.projects = list.map((n) => Object.assign(old.get(n.id) || {}, n));
}
// Projekt anlegen (p = null) oder bearbeiten
function openProjectEditor(p) {
  const isNew = !p;
  const f = { name: p?.name || '', icon: p?.icon || state.icons[state.projects.length % state.icons.length],
    color: p?.color || state.palette[state.projects.length % state.palette.length],
    mode: 'new', folder: p?.path || '' };
  let error = '';
  let unlisted = [];
  let busy = false;
  const errText = (e) => String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  const pick = async () => { const dir = await window.nexus.pickFolder(f.folder || state.projectRoot); if (dir) { f.folder = dir; if (!f.name.trim()) f.name = dir.split(/[\\/]/).pop(); f.mode = 'existing'; render(); } };
  const save = async () => {
    if (busy) return;
    error = '';
    busy = true;
    try {
      if (isNew) {
        const r = await window.nexus.createProject({ name: f.name, icon: f.icon, color: f.color, newFolder: f.mode === 'new', folder: f.mode === 'existing' ? f.folder : null });
        setProjects(r.projects);
        closeModal();
        renderProjects();
        state.project = null;
        selectProject(r.id);
      } else {
        const patch = { name: f.name, icon: f.icon, color: f.color };
        if (f.folder !== p.path) patch.path = f.folder;
        setProjects(await window.nexus.updateProject(p.id, patch));
        closeModal();
        if (p.id === state.project) { document.body.style.setProperty('--pc', p.color); renderDesk(); if (patch.path) refreshSessions(); }
        renderProjects();
      }
    } catch (e) { error = errText(e); render(); } finally { busy = false; }
  };
  const remove = () => {
    const n = state.desks[p.id]?.workspaces.length || 0;
    openModal(() => {
      document.querySelector('#modal .modal-box').replaceChildren(
        el('h2', {}, `„${p.name}“ aus NEXUS entfernen?`),
        el('p', { class: 'm-sub' }, `Das Projekt verschwindet aus der Liste${n ? `, sein Desk mit ${n} Workspace(s) wird geschlossen` : ''}.`),
        el('p', { class: 'm-sub' }, `Der Ordner ${p.path} und alle Dateien darin bleiben unverändert. Claude-Code-Sitzungen bleiben ebenfalls erhalten. Du kannst den Ordner später wieder als Projekt aufnehmen.`),
        el('div', { class: 'm-foot' },
          el('button', { onclick: () => openProjectEditor(p) }, 'Abbrechen'),
          el('button', { class: 'danger-fill', onclick: () => removeProject(p) }, 'Aus NEXUS entfernen')));
    });
  };
  const input = (key, props) => el('input', { ...props, value: f[key], oninput: (e) => { f[key] = e.target.value; } });
  const render = () => {
    const box = document.querySelector('#modal .modal-box');
    const icons = el('div', { class: 'emojis p-icons' }, ...state.icons.map((t) => el('button', { class: 'emoji' + (f.icon === t ? ' on' : ''), onclick: () => { f.icon = t; render(); } }, t)));
    const colors = el('div', { class: 'swatches p-colors' }, ...state.palette.map((c) => el('button', { class: 'opt' + (f.color === c ? ' on' : ''), title: c, style: { background: c }, onclick: () => { f.color = c; render(); } })));
    const radio = (mode, label, extra) => el('label', { class: 'm-check' }, el('input', { type: 'radio', name: 'pmode', ...(f.mode === mode ? { checked: '' } : {}), onchange: () => { f.mode = mode; render(); } }), label, extra || null);
    const folderRow = el('div', { class: 'p-folder' }, el('code', {}, f.folder || 'Kein Ordner gewählt'), el('button', { onclick: pick }, isNew ? 'Ordner wählen…' : 'Ändern…'));
    const folderPart = isNew ? [
      radio('new', 'Neuen Ordner anlegen', el('code', { class: 'p-hint' }, `${state.projectRoot}\\${f.name.trim() || '…'}`)),
      radio('existing', 'Vorhandenen Ordner verwenden'),
      f.mode === 'existing' ? folderRow : null,
      f.mode === 'existing' && unlisted.length ? el('div', { class: 'p-unlisted' }, el('div', { class: 'm-sub' }, `Noch nicht in NEXUS (aus ${state.projectRoot}):`),
        ...unlisted.map((dir) => el('button', { class: 'p-chip' + (f.folder === dir ? ' on' : ''), onclick: () => { f.folder = dir; f.name = dir.split(/[\\/]/).pop(); render(); } }, dir.split(/[\\/]/).pop()))) : null,
    ] : [folderRow, el('p', { class: 'm-sub' }, 'Ein anderer Ordner gilt für neue Claude-Code-Chats und Terminals; schon offene laufen im alten Ordner weiter.')];
    box.replaceChildren(...[
      el('div', { class: 'm-head' }, el('h2', {}, isNew ? 'Neues Projekt' : 'Projekt bearbeiten'), el('button', { onclick: closeModal }, 'Abbrechen')),
      el('h3', {}, 'Name'),
      input('name', { type: 'text', class: 'm-input', maxlength: '60', placeholder: 'z. B. Mein Projekt' }),
      el('h3', {}, 'Ordner'),
      ...folderPart,
      el('h3', {}, 'Icon und Farbe'),
      icons, colors,
      error ? el('div', { class: 'm-error' }, error) : null,
      el('div', { class: 'm-foot' },
        isNew ? null : el('button', { class: 'danger', style: { marginRight: 'auto' }, onclick: remove }, 'Aus NEXUS entfernen…'),
        el('button', { class: 'primary', onclick: save }, isNew ? 'Projekt anlegen' : 'Speichern')),
    ].filter(Boolean));
    const nameEl = box.querySelector('.m-input');
    // Hinweis "neuer Ordner" live mitschreiben, ohne das Eingabefeld neu aufzubauen
    nameEl.addEventListener('input', () => { const h = box.querySelector('.p-hint'); if (h) h.textContent = `${state.projectRoot}\\${f.name.trim() || '…'}`; });
    nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  };
  openModal(render);
  setTimeout(() => document.querySelector('#modal .m-input')?.focus(), 0);
  if (isNew) window.nexus.unlistedFolders().then((u) => { unlisted = u; if (modalOpen && modalRender === render) render(); });
}
async function removeProject(p) {
  for (const [id, l] of [...live]) if (l.projectId === p.id) destroyLive(id);
  setProjects(await window.nexus.removeProject(p.id));
  delete state.desks[p.id];
  closeModal();
  if (state.project === p.id) {
    state.project = null;
    const next = state.projects[0];
    if (next) selectProject(next.id); else renderNoProject();
  }
  renderProjects();
}
function renderNoProject() {
  $('#desk-title').replaceChildren(el('span', { class: 'd-name' }, 'Kein Projekt'));
  $('#ws-chips').replaceChildren();
  $('#layouts').replaceChildren();
  $('#grid').className = 'layout-1';
  $('#grid').replaceChildren(el('div', { class: 'cell' }, el('div', { class: 'cell-empty' }, 'Noch kein Projekt.',
    el('button', { class: 'primary', onclick: () => openProjectEditor(null) }, '＋ Projekt anlegen'))));
  $('#session-list').replaceChildren();
  window.nexus.webHideAll();
}
$('#project-add').onclick = () => openProjectEditor(null);
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
  const ws = { id: uid(), type, title: extra.title || wsInfo(type).label, sessionId: extra.sessionId || null, url: null };
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
  confirmRemove(ws, () => reallyRemove(wsId));
}
function reallyRemove(wsId) {
  const d = desk();
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
  if (wsInfo(l.type).kind === 'web') window.nexus.webDestroy(wsId);
  l.body.remove();
  live.delete(wsId);
}

// Live-Instanz eines Workspaces holen oder anlegen (laeuft weiter, auch wenn unsichtbar).
function ensureLive(ws, pid) {
  if (live.has(ws.id)) return live.get(ws.id);
  const p = project(pid);
  const kind = wsInfo(ws.type).kind;
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
      theme: termTheme(p) });
    l.termProject = p;
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
      ev.stopPropagation(); closeOverlay(); setProjects(await window.nexus.updateProject(p.id, { icon: t })); renderProjects(); renderDesk();
    } }, t)))]);
  };
  const sw = el('span', { class: 'd-swatch', title: 'Projektfarbe', style: { background: p.color } });
  sw.onclick = (e) => { e.stopPropagation(); swatchOverlay(sw, state.palette, async (c) => { setProjects(await window.nexus.updateProject(p.id, { color: c })); document.body.style.setProperty('--pc', p.color); renderProjects(); renderDesk(); }); };
  $('#desk-title').replaceChildren(icon, el('span', { class: 'd-name' }, p.name), sw);
  // Raster-Knoepfe
  $('#layouts').replaceChildren(...[1, 2, 3, 4].map((n) => el('button', { class: 'lay' + (d.layout === n ? ' on' : ''), title: `${n} nebeneinander`, onclick: () => setLayout(n) }, layoutIcon(n))));
  renderChrome();
  // Zellen
  const grid = $('#grid');
  grid.className = 'layout-' + d.layout;
  // alle DOM-Workspaces erst parken
  for (const l of live.values()) if (wsInfo(l.type).kind !== 'web') $('#parking').append(l.body);
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
      el('div', { class: 'ce-btns' }, ...addableTypes().map(([type, info]) => el('button', { onclick: () => { d.focus = i; addWorkspace(type); } }, `${info.icon} ${info.label}`)),
        el('button', { class: 'ghost', onclick: () => openAiManager() }, '＋ KI aufnehmen…')),
      d.workspaces.length ? el('div', { class: 'ce-sub' }, 'oder oben einen vorhandenen Workspace anklicken') : null));
    return cell;
  }
  const info = wsInfo(ws.type);
  const l = ensureLive(ws, state.project);
  const head = el('div', { class: 'cell-head', style: { '--wc': info.color } },
    el('span', { class: 'ch-icon' }, info.icon),
    el('span', { class: 'ch-title', title: ws.title }, ws.title),
    el('span', { class: 'ch-type' }, info.label));
  const actions = el('div', { class: 'ch-actions' });
  if (info.kind === 'web' && state.aiStatus[ws.type] === 'out') {
    actions.append(el('button', { class: 'login-hint', title: 'Einmal anmelden – gilt dann für alle Workspaces dieser KI', onclick: () => window.nexus.aiLogin(ws.type) }, 'Anmelden'));
  }
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
    const info = wsInfo(w.type);
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
  if (overlayOpen || modalOpen) return;
  const d = desk();
  const shown = new Set();
  for (const slot of document.querySelectorAll('.web-slot')) {
    const id = slot.dataset.ws;
    const r = slot.getBoundingClientRect();
    window.nexus.webBounds(id, { x: r.left, y: r.top, width: r.width, height: r.height });
    shown.add(id);
  }
  for (const [id, l] of live) if (wsInfo(l.type).kind === 'web' && !shown.has(id)) window.nexus.webBounds(id, null);
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
    const label = wsInfo(ws.type).label;
    if (t.endsWith(' - ' + label)) t = t.slice(0, -(label.length + 3)).trim();
    if (s.auth || !t || t === label || /^(Claude|ChatGPT|Gemini|Google Gemini|Neue Sitzung|New chat|Neuer Chat)$/i.test(t) || /^ChatGPT:|Anmelden|Log in|Sign in|Konto erstellen/i.test(t)) t = label;
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
    ...addableTypes().map(([type, info]) => el('button', { class: 'menu-item', style: { '--wc': info.color }, onclick: (ev) => { ev.stopPropagation(); closeOverlay(); addWorkspace(type); } },
      el('span', { class: 'mi-icon' }, info.icon), el('span', {}, info.label),
      el('span', { class: 'mi-sub' }, info.kind === 'web' ? statusText(type) : info.kind === 'chat' ? 'NEXUS-Chat' : 'Terminal'))),
    el('button', { class: 'menu-item', style: { '--wc': '#6366f1' }, onclick: (ev) => { ev.stopPropagation(); closeOverlay(); openAiManager(); } },
      el('span', { class: 'mi-icon' }, '＋'), el('span', {}, 'KI in NEXUS aufnehmen…')))]);
};
$('#open-folder').onclick = () => { if (state.project) window.nexus.openFolder(state.project); };

// ---------- Themes ----------
// NEXUS-Oberflaeche, Claude-Code-Chat und Terminals ueber CSS-Variablen (app.css) bzw. xterm-Theme.
// Web-KIs: Electron meldet den Seiten nur hell/dunkel (prefers-color-scheme). Kein Eingriff in die Seiten:
// Claude/ChatGPT/Gemini folgen, solange ihr Theme dort auf "System" steht.
const THEMES = [
  { id: 'hell', name: 'Hell', mode: 'light', hint: 'klares Weiß', sw: ['#ffffff', '#eef0f4', '#1d2027'] },
  { id: 'creme', name: 'Creme', mode: 'light', hint: 'warm, nicht so grell', sw: ['#fffcf5', '#f1ece0', '#2b2720'] },
  { id: 'sand', name: 'Sand', mode: 'light', hint: 'leicht beige', sw: ['#f5efe3', '#e5dccb', '#2e2819'] },
  { id: 'nacht', name: 'Nacht', mode: 'dark', hint: 'das bisherige Dunkel', sw: ['#17181d', '#1d1f26', '#e7e8ec'] },
  { id: 'retro', name: 'Retro', mode: 'dark', hint: 'Grün auf Schwarz', sw: ['#0a100a', '#0f180f', '#33ff66'] },
  { id: 'kupfer', name: 'Kupfer', mode: 'dark', hint: 'Claudes Wahl: Kohle und Kupfer', sw: ['#211d19', '#2a251f', '#e8915c'] },
];
const curTheme = () => THEMES.find((t) => t.id === state.settings?.theme) || THEMES[3];
const isLight = () => curTheme().mode === 'light';
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function termTheme(p) {
  const base = { background: cssVar('--bg'), foreground: cssVar('--text'), cursor: p.color, selectionBackground: p.color + (isLight() ? '44' : '55') };
  if (curTheme().id === 'retro') return { ...base, cursor: cssVar('--text'), selectionBackground: '#33ff6633' };
  return isLight()
    ? { ...base, cursorAccent: base.background, black: cssVar('--text'), white: '#8b8f9c', brightWhite: cssVar('--muted'), yellow: '#a16207', brightYellow: '#b45309' }
    : base;
}
function renderThemeBtn() {
  const t = curTheme();
  document.documentElement.dataset.theme = t.id;
  for (const l of live.values()) if (l.term && l.termProject) l.term.options.theme = termTheme(l.termProject);
  const b = $('#theme');
  b.textContent = t.mode === 'light' ? '☀️' : '🌙';
  b.title = `Theme: ${t.name} – Klick zum Wechseln`;
}
async function setTheme(id) {
  state.settings = await window.nexus.setSetting('theme', id);
  renderThemeBtn();
}
// Sonne/Mond: wechselt zwischen dem gewaehlten hellen und dunklen Theme
$('#theme').onclick = () => setTheme(isLight() ? state.settings.darkTheme || 'nacht' : state.settings.lightTheme || 'hell');

// ---------- Einstellungen ----------
function openSettings() {
  const render = () => {
    const pick = (mode) => {
      const key = mode === 'light' ? 'lightTheme' : 'darkTheme';
      return el('div', { class: 'theme-grid' }, ...THEMES.filter((t) => t.mode === mode).map((t) => el('button', {
        class: 'theme-card' + (state.settings[key] === t.id ? ' on' : ''), title: t.hint,
        onclick: async () => {
          state.settings = await window.nexus.setSetting(key, t.id);
          // gleich anzeigen, wenn gerade diese Seite (hell/dunkel) aktiv ist
          if (curTheme().mode === mode) await setTheme(t.id);
          render();
        } },
        el('span', { class: 'theme-sw' }, ...t.sw.map((c) => el('i', { style: { background: c } }))),
        el('span', { class: 'theme-name' }, t.name), el('span', { class: 'theme-hint' }, t.hint))));
    };
    document.querySelector('#modal .modal-box').replaceChildren(
      el('div', { class: 'm-head' }, el('h2', {}, 'Einstellungen'), el('button', { onclick: closeModal }, 'Fertig')),
      el('h3', {}, 'Theme'),
      el('p', { class: 'm-sub' }, 'Der Sonne/Mond-Knopf oben rechts wechselt zwischen diesen beiden Themes.'),
      el('div', { class: 'theme-label' }, '☀️ Helles Theme'), pick('light'),
      el('div', { class: 'theme-label' }, '🌙 Dunkles Theme'), pick('dark'),
      el('p', { class: 'm-sub' }, 'KIs im Web (Claude, ChatGPT …) werden hell oder dunkel, wenn ihr Theme dort auf „System“ steht. Die genauen Farben bestimmt der Anbieter.'),
      el('h3', {}, 'Workspaces'),
      el('label', { class: 'm-check' }, el('input', { type: 'checkbox', ...(state.settings.confirmRemove !== false ? { checked: '' } : {}),
        onchange: async (e) => { state.settings = await window.nexus.setSetting('confirmRemove', e.target.checked); } }),
      'Vor dem Schließen eines Workspaces nachfragen'));
  };
  openModal(render);
}
$('#settings').onclick = () => openSettings();

// ---------- Meine KIs ----------
const STATUS = {
  in: { dot: 'in', text: 'angemeldet' },
  unknown: { dot: 'unknown', text: 'eingerichtet' },
  out: { dot: 'out', text: 'nicht angemeldet' },
};
const statusText = (id) => (STATUS[state.aiStatus[id]] || { text: 'prüfe…' }).text;

function renderAis() {
  const rows = state.ais.map((a) => {
    const st = state.aiStatus[a.id];
    const row = el('div', { class: 'ai-row', style: { '--wc': a.color }, title: `${a.label}: ${statusText(a.id)}`, onclick: (e) => { e.stopPropagation(); aiStatusPopover(row, a); } },
      el('span', { class: 'ai-icon' }, a.icon),
      el('span', { class: 'name' }, a.label),
      el('span', { class: 'ai-dot ' + (STATUS[st]?.dot || '') }),
      st === 'out' ? el('button', { class: 'ai-login', onclick: (e) => { e.stopPropagation(); window.nexus.aiLogin(a.id); } }, 'Anmelden') : null);
    return row;
  });
  if (!state.ais.length) rows.push(el('div', { class: 'side-note' }, 'Noch keine KI aufgenommen.'));
  $('#ai-list').replaceChildren(...rows);
}

// Statusfenster einer KI (Klick in "Meine KIs")
function aiStatusPopover(anchor, a) {
  const st = state.aiStatus[a.id];
  const uses = Object.entries(state.desks).flatMap(([pid, d]) => d.workspaces.filter((w) => w.type === a.id).map(() => pid));
  const deskNames = [...new Set(uses)].map((pid) => project(pid)?.name).filter(Boolean);
  const act = (label, fn, cls = '') => el('button', { class: cls, onclick: (e) => { e.stopPropagation(); closeOverlay(); fn(); } }, label);
  const hint = {
    in: 'Angemeldet – gilt für alle Workspaces und Desks.',
    unknown: 'Eingerichtet. NEXUS kann bei dieser KI nicht sicher erkennen, ob du angemeldet bist.',
    out: 'Nicht angemeldet. Einmal anmelden genügt für alle Workspaces.',
  }[st] || 'Status wird geprüft…';
  openOverlay(anchor, [el('div', { class: 'ai-pop', style: { '--wc': a.color } },
    el('div', { class: 'ap-head' }, el('span', { class: 'ai-icon' }, a.icon),
      el('div', {}, el('div', { class: 'ap-name' }, a.label), el('div', { class: 'm-sub' }, a.url)),
      el('span', { class: 'm-status ' + (STATUS[st]?.dot || '') }, statusText(a.id))),
    el('div', { class: 'ap-hint' }, hint),
    el('div', { class: 'm-sub' }, uses.length ? `${uses.length} Workspace(s) in: ${deskNames.join(', ')}` : 'In keinem Desk geöffnet.'),
    el('div', { class: 'ap-btns' },
      act(st === 'out' ? 'Anmelden' : 'Konto öffnen', () => window.nexus.aiLogin(a.id), st === 'out' ? 'primary' : ''),
      act('In aktiven Platz öffnen', () => addWorkspace(a.id)),
      act('Verwalten…', () => openAiManager())))]);
  // rechts neben der Zeile statt darunter (Seitenleiste)
  const pop = $('#popover');
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${r.right + 8}px`;
  pop.style.top = `${Math.max(8, Math.min(r.top - 8, innerHeight - pop.offsetHeight - 8))}px`;
}

// Bestaetigung mit "Nicht mehr fragen"
function confirmRemove(ws, onYes) {
  if (state.settings.confirmRemove === false) return onYes();
  let skip = false;
  openModal(() => {
    document.querySelector('#modal .modal-box').replaceChildren(
      el('h2', {}, 'Workspace schließen?'),
      el('p', { class: 'm-sub' }, `„${ws.title}“ wird aus dem Desk entfernt. Der Chat selbst bleibt beim Anbieter bzw. in Claude Code erhalten.`),
      el('label', { class: 'm-check' }, el('input', { type: 'checkbox', onchange: (e) => { skip = e.target.checked; } }), 'Nicht mehr fragen'),
      el('div', { class: 'm-foot' },
        el('button', { onclick: closeModal }, 'Abbrechen'),
        el('button', { class: 'primary', onclick: async () => {
          if (skip) state.settings = await window.nexus.setSetting('confirmRemove', false);
          closeModal(); onYes();
        } }, 'Schließen')));
    setTimeout(() => document.querySelector('#modal .primary')?.focus(), 0);
  });
}
window.nexus.onAiStatus((id, st) => {
  state.aiStatus[id] = st;
  renderAis();
  if (modalOpen && modalRender) modalRender();
  if (state.project) renderDesk();
});
$('#ai-add').onclick = () => openAiManager();

// Modal-Dialog (Web-Ansichten liegen nativ darueber -> ausblenden)
let modalOpen = false;
let modalRender = null;
function openModal(render) {
  closeOverlay();
  modalOpen = true;
  modalRender = render;
  window.nexus.webHideAll();
  $('#modal').hidden = false;
  render();
}
function closeModal() {
  modalOpen = false;
  modalRender = null;
  $('#modal').hidden = true;
  layoutWeb();
}
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalOpen) closeModal(); });

async function refreshAfterAiChange(ais) {
  state.ais = ais;
  const st = await window.nexus.getState();
  state.desks = st.desks;
  // Live-Instanzen entfernter KIs aufraeumen
  for (const [id, l] of [...live]) if (wsInfo(l.type).label === 'Entfernte KI') destroyLive(id);
  state.aiStatus = await window.nexus.aiStatus();
  renderAis(); renderProjects(); if (state.project) renderDesk();
  if (modalOpen && modalRender) modalRender();
}

function openAiManager() {
  const picked = new Set();
  let error = '';
  const render = () => {
    const box = document.querySelector('#modal .modal-box');
    const mine = state.ais.map((a) => {
      const st = state.aiStatus[a.id];
      return el('div', { class: 'm-ai', style: { '--wc': a.color } },
        el('span', { class: 'ai-icon' }, a.icon),
        el('div', { class: 'm-ai-text' }, el('div', {}, a.label), el('div', { class: 'm-sub' }, a.url)),
        el('span', { class: 'm-status ' + (STATUS[st]?.dot || '') }, statusText(a.id)),
        el('button', { class: st === 'out' ? 'primary' : '', onclick: () => window.nexus.aiLogin(a.id) }, st === 'out' ? 'Anmelden' : 'Konto öffnen'),
        st && st !== 'out' ? el('button', { title: 'Alle Anmeldedaten dieser KI in NEXUS löschen', onclick: async () => {
          if (!confirm(`Bei ${a.label} abmelden?\nNEXUS löscht dafür Cookies und Speicher dieser KI. Offene Workspaces dieser KI werden geschlossen.`)) return;
          await window.nexus.aiLogout(a.id);
          await refreshAfterAiChange(state.ais);
        } }, 'Abmelden') : null,
        el('button', { class: 'danger', title: 'Aus NEXUS entfernen', onclick: async () => {
          const n = Object.values(state.desks).reduce((k, d) => k + d.workspaces.filter((w) => w.type === a.id).length, 0);
          if (!confirm(`${a.label} aus NEXUS entfernen?\nDie Anmeldung wird gelöscht${n ? ` und ${n} Workspace(s) verschwinden aus den Desks` : ''}.\nDeine Chats beim Anbieter bleiben erhalten.`)) return;
          await refreshAfterAiChange(await window.nexus.aiRemove(a.id));
        } }, '✕'));
    });
    const have = new Set(state.ais.map((a) => a.id));
    const offer = state.catalog.filter((c) => !have.has(c.id)).map((c) => el('label', { class: 'm-pick' + (picked.has(c.id) ? ' on' : ''), style: { '--wc': c.color } },
      el('input', { type: 'checkbox', ...(picked.has(c.id) ? { checked: '' } : {}), onchange: (e) => { if (e.target.checked) picked.add(c.id); else picked.delete(c.id); render(); } }),
      el('span', { class: 'ai-icon' }, c.icon), el('span', {}, c.label)));
    const nameIn = el('input', { type: 'text', placeholder: 'Name, z. B. Grok', maxlength: '40' });
    const urlIn = el('input', { type: 'url', placeholder: 'https://…' });
    const add = async () => {
      error = '';
      const custom = urlIn.value.trim() ? { label: nameIn.value, url: urlIn.value } : null;
      if (!picked.size && !custom) { error = 'Wähle eine KI aus oder gib eine Adresse ein.'; render(); return; }
      try {
        const before = new Set(state.ais.map((a) => a.id));
        const ais = await window.nexus.aiAdd([...picked], custom);
        picked.clear();
        await refreshAfterAiChange(ais);
        // gleich das Anmeldefenster der ersten neuen KI oeffnen
        const fresh = ais.filter((a) => !before.has(a.id));
        if (fresh[0]) window.nexus.aiLogin(fresh[0].id);
      } catch (e) {
        error = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
        render();
      }
    };
    box.replaceChildren(...[
      el('div', { class: 'm-head' }, el('h2', {}, 'Meine KIs'), el('button', { onclick: closeModal }, 'Fertig')),
      el('p', { class: 'm-sub' }, 'Einmal anmelden genügt: Die Anmeldung gilt für alle Workspaces und Desks dieser KI und bleibt nach einem Neustart erhalten.'),
      mine.length ? el('div', { class: 'm-list' }, ...mine) : el('div', { class: 'side-note' }, 'Noch keine KI aufgenommen.'),
      el('h3', {}, 'KI in NEXUS aufnehmen'),
      offer.length ? el('div', { class: 'm-grid' }, ...offer) : el('div', { class: 'side-note' }, 'Alle bekannten KIs sind schon aufgenommen.'),
      el('div', { class: 'm-custom' }, el('div', { class: 'm-sub' }, 'Andere KI (Webseite):'), nameIn, urlIn),
      error ? el('div', { class: 'm-error' }, error) : null,
      el('div', { class: 'm-foot' }, el('button', { class: 'primary', onclick: add }, 'Aufnehmen & anmelden')),
      el('h3', {}, 'Einstellungen'),
      el('label', { class: 'm-check' }, el('input', { type: 'checkbox', ...(state.settings.confirmRemove !== false ? { checked: '' } : {}),
        onchange: async (e) => { state.settings = await window.nexus.setSetting('confirmRemove', e.target.checked); } }),
      'Vor dem Schließen eines Workspaces nachfragen')].filter(Boolean));
  };
  openModal(render);
}

// ---------- Start ----------
(async () => {
  Object.assign(state, await window.nexus.getState());
  state.settings ||= {};
  renderProjects();
  renderAis();
  renderThemeBtn();
  window.nexus.aiStatus().then((st) => { state.aiStatus = st; renderAis(); });
  const first = project(state.lastProject) || state.projects.find((p) => p.name === 'NEXUS') || state.projects[0];
  if (first) selectProject(first.id); else renderNoProject();
})();

// Selbsttest (nur mit --selftest): Desk mit 3 Workspaces im 3er-Raster, ohne etwas zu senden.
window.__nexusSelftest = async () => {
  const p = state.projects.find((x) => x.name === 'NEXUS') || state.projects[0];
  await selectProject(p.id);
  if (!state.ais.some((a) => a.id === 'claude')) await refreshAfterAiChange(await window.nexus.aiAdd(['claude', 'chatgpt']));
  const d = desk();
  d.layout = 3;
  addWorkspace('claude');
  addWorkspace('chatgpt');
  return { project: p.name, layout: d.layout, workspaces: d.workspaces.map((w) => w.type), cells: d.cells };
};
