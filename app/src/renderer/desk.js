/* global Terminal, FitAddon, NexusChat */
// Desk eines Projekts: Workspaces (3C, Terminal, Web-KIs) im Raster 1–4.

// ---------- Desk-Daten ----------
function desk(pid = state.project) {
  if (!state.desks[pid]) {
    // neues Projekt: leerer Desk, man waehlt selbst, was man oeffnet
    state.desks[pid] = { layout: 1, cells: [null, null, null, null], focus: 0, workspaces: [] };
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
    s.textContent = '✓ ' + t('desk.saved');
    s.classList.add('on');
    setTimeout(() => s.classList.remove('on'), 1400);
  }, 250);
}
function saveDeskFor(pid) { if (pid === state.project) saveDesk(); else window.nexus.saveDesk(pid, state.desks[pid]); }
function refreshSessionsIf(pid) { if (pid === state.project) refreshSessions(); }

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
// ---------- Status je Workspace und Projekt (wie bei mehreren Claude-Code-Sitzungen) ----------
// fertig = Auftrag beendet, waehrend der Workspace nicht zu sehen war; bleibt markiert, bis man ihn ansieht
function isVisible(wsId) {
  const l = live.get(wsId);
  if (!l || l.projectId !== state.project || document.hidden) return false;
  const d = desk();
  return d.cells.slice(0, d.layout).includes(wsId);
}
function markDone(wsId) {
  const l = live.get(wsId);
  if (l && !isVisible(wsId)) l.done = true;
}
// sichtbare Workspaces des aktiven Projekts gelten als angesehen
function clearSeen() {
  for (const [id, l] of live) if (l.done && isVisible(id)) l.done = false;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { clearSeen(); renderChrome(); renderProjects(); } });
// Zusammenfassung fuer die Projektliste: wartet > arbeitet > fertig
function projectStatus(pid) {
  let s = null;
  for (const l of live.values()) {
    if (l.projectId !== pid) continue;
    if (l.waiting) return 'waiting';
    if (l.busy) s = 'busy';
    else if (l.done && !s) s = 'done';
  }
  return s;
}

function placeInFocus(wsId) {
  const d = desk();
  const cur = d.cells.slice(0, d.layout).indexOf(wsId);
  if (cur >= 0) { d.focus = cur; renderDesk(); saveDesk(); return; }
  d.cells[d.focus] = wsId;
  renderDesk(); saveDesk();
}
function removeWorkspace(wsId) {
  const ws = wsById(wsId);
  if (ws) confirmRemove(ws, () => reallyRemove(wsId));
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
// Bestaetigung mit "Nicht mehr fragen"
function confirmRemove(ws, onYes) {
  if (state.settings.confirmRemove === false) return onYes();
  let skip = false;
  openModal(() => {
    modalBox().replaceChildren(
      el('h2', {}, t('ws.closeTitle')),
      el('p', { class: 'm-sub' }, t('ws.closeText', { title: ws.title })),
      el('label', { class: 'm-check' }, el('input', { type: 'checkbox', onchange: (e) => { skip = e.target.checked; } }), t('common.dontAsk')),
      el('div', { class: 'm-foot' },
        el('button', { onclick: closeModal }, t('common.cancel')),
        el('button', { class: 'primary', onclick: async () => {
          if (skip) state.settings = await window.nexus.setSetting('confirmRemove', false);
          closeModal(); onYes();
        } }, t('common.close'))));
    setTimeout(() => document.querySelector('#modal .primary')?.focus(), 0);
  });
}

// Live-Instanz eines Workspaces holen oder anlegen (laeuft weiter, auch wenn unsichtbar)
function ensureLive(ws, pid) {
  if (live.has(ws.id)) return live.get(ws.id);
  const p = project(pid);
  const kind = wsInfo(ws.type).kind;
  const body = el('div', { class: 'ws-body ' + kind });
  const l = { type: ws.type, projectId: pid, body, busy: false, waiting: false, webState: {} };
  live.set(ws.id, l);
  if (kind === 'chat') {
    l.view = NexusChat.create(body, {
      project: p, sessionId: ws.sessionId, t, tn, locale,
      getSlashCommands: () => state.slashCommands,
      // zuletzt gewaehlter Modus und Modell gelten auch fuer neue Chats
      // 3C und Codex merken sich Modus und Modell getrennt
      agent: wsInfo(ws.type).agent || 'claude',
      getMode: () => state.settings[ws.type === 'codex' ? 'codexMode' : 'chatMode'],
      onMode: (m) => setSetting(ws.type === 'codex' ? 'codexMode' : 'chatMode', m),
      getModel: () => state.settings[ws.type === 'codex' ? 'codexModel' : 'chatModel'],
      onModel: (m) => setSetting(ws.type === 'codex' ? 'codexModel' : 'chatModel', m),
      onSession: (id) => { ws.sessionId = id; saveDeskFor(pid); refreshSessionsIf(pid); },
      onTitle: (title) => { ws.title = title; saveDeskFor(pid); renderChrome(); },
      onBusy: (b) => { const was = l.busy; l.busy = b; if (was && !b) markDone(ws.id); renderChrome(); renderProjects(); },
      onWaiting: (b) => { l.waiting = b; renderChrome(); renderProjects(); },
      onUsage: (info) => { state.usage = info; for (const x of live.values()) x.view?.setUsage(info); },
      onTurnDone: () => refreshSessionsIf(pid),
    });
    if (state.usage) l.view.setUsage(state.usage);
  } else if (kind === 'term') {
    const term = new Terminal({ fontFamily: '"Cascadia Mono", Consolas, Menlo, "SF Mono", "DejaVu Sans Mono", "Liberation Mono", monospace', fontSize: 13, cursorBlink: true, theme: termTheme(p) });
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

// ---------- Desk zeichnen ----------
function renderDesk() {
  if (!project()) return renderNoProject();
  const d = desk();
  const p = project();
  const icon = el('span', { class: 'd-icon', title: t('desk.changeIcon') }, p.icon);
  icon.onclick = (e) => {
    e.stopPropagation();
    openOverlay(icon, [el('div', { class: 'emojis' }, ...state.icons.map((ic) => el('button', { class: 'emoji', onclick: async (ev) => {
      ev.stopPropagation(); closeOverlay(); setProjects(await window.nexus.updateProject(p.id, { icon: ic })); renderProjects(); renderDesk();
    } }, ic)))]);
  };
  const sw = el('span', { class: 'd-swatch', title: t('desk.projectColor'), style: { background: p.color } });
  sw.onclick = (e) => { e.stopPropagation(); swatchOverlay(sw, state.palette, async (c) => { setProjects(await window.nexus.updateProject(p.id, { color: c })); document.body.style.setProperty('--pc', p.color); renderProjects(); renderDesk(); }); };
  const ctxBtn = el('button', { class: 'd-context' + ((state.contexts[p.id] || '').trim() ? ' has' : ''), title: t('context.button'), onclick: () => openContextEditor(p) }, '📋');
  $('#desk-title').replaceChildren(icon, el('span', { class: 'd-name' }, p.name), sw, ctxBtn);
  $('#layouts').replaceChildren(...[1, 2, 3, 4].map((n) => el('button', { class: 'lay' + (d.layout === n ? ' on' : ''), title: t('desk.layout', { n }), onclick: () => setLayout(n) }, layoutIcon(n))));
  renderChrome();
  const grid = $('#grid');
  grid.className = 'layout-' + d.layout;
  // alle DOM-Workspaces erst parken
  for (const l of live.values()) if (wsInfo(l.type).kind !== 'web') $('#parking').append(l.body);
  const cells = [];
  for (let i = 0; i < d.layout; i++) cells.push(renderCell(i, d.cells[i] ? wsById(d.cells[i]) : null));
  grid.replaceChildren(...cells);
  requestAnimationFrame(() => { layoutWeb(); fitTerms(); });
  // was jetzt zu sehen ist, gilt als angesehen
  const hadDone = [...live.values()].some((l) => l.done);
  clearSeen();
  if (hadDone) { renderChrome(); renderProjects(); }
}
function layoutIcon(n) {
  const s = el('span', { class: 'lay-ico lay-' + n });
  for (let i = 0; i < n; i++) s.append(el('i'));
  return s;
}
function setLayout(n) {
  const d = desk();
  d.layout = n;
  // leere sichtbare Zellen mit noch nicht sichtbaren Workspaces auffuellen
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
    cell.append(el('div', { class: 'cell-empty' }, el('div', { class: 'ce-title' }, t('desk.emptyCell')),
      el('div', { class: 'ce-btns' }, ...addableTypes().map(([type, info]) => el('button', { onclick: () => { d.focus = i; addWorkspace(type); } }, `${info.icon} ${info.label}`)),
        el('button', { class: 'ghost', onclick: () => openAiManager() }, '＋ ' + t('ai.addShort'))),
      d.workspaces.length ? el('div', { class: 'ce-sub' }, t('desk.orPick')) : null));
    return cell;
  }
  const info = wsInfo(ws.type);
  // Claude Code fehlt oder ist nicht angemeldet: Hinweis statt Chat/Terminal
  if (info.kind !== 'web' && claudeProblem()) {
    cell.append(el('div', { class: 'cell-empty claude-hint' },
      el('div', { class: 'ce-title' }, t(`claude.${claudeProblem()}Title`)),
      el('p', { class: 'm-sub' }, t(`claude.${claudeProblem()}Text`)),
      el('div', { class: 'ce-btns' },
        claudeProblem() === 'missing' ? el('button', { class: 'primary', onclick: () => window.open('https://claude.com/claude-code') }, t('claude.install')) : null,
        el('button', { onclick: async () => { state.claude = await window.nexus.claudeCheck(); renderDesk(); } }, t('claude.recheck')))));
    return cell;
  }
  const l = ensureLive(ws, state.project);
  const head = el('div', { class: 'cell-head', style: { '--wc': info.color } },
    el('span', { class: 'ch-icon' }, info.icon),
    el('span', { class: 'ch-title', title: ws.title }, ws.title),
    el('span', { class: 'ch-type' }, info.label));
  const actions = el('div', { class: 'ch-actions' });
  const btn = (titleKey, label, onclick, cls) => el('button', { title: t(titleKey), onclick, ...(cls ? { class: cls } : {}) }, label);
  if (info.kind === 'web' && state.aiStatus[ws.type] === 'out') actions.append(btn('ai.loginHint', t('ai.login'), () => window.nexus.aiLogin(ws.type), 'login-hint'));
  if (info.kind === 'web' && (state.contexts[state.project] || '').trim()) {
    actions.append(el('button', { class: 'ctx-copy', title: t('context.copyHint'), onclick: () => copyContext(state.project) }, '📋 ' + t('context.copy')));
  }
  if (info.kind === 'web') {
    actions.append(btn('web.back', '←', () => window.nexus.webNav(ws.id, 'back')), btn('web.reload', '↻', () => window.nexus.webNav(ws.id, 'reload')),
      btn('web.newChat', '＋', () => window.nexus.webNav(ws.id, 'home')), btn('web.external', '⇱', () => window.nexus.webNav(ws.id, 'external')));
  } else {
    actions.append(btn('ws.restart', '↻', () => { destroyLive(ws.id); renderDesk(); }));
    if (info.kind === 'chat' && ws.sessionId) actions.append(btn('ws.openTerminal', '⌨', () => addWorkspace('claude-code-term', { sessionId: ws.sessionId, title: ws.title })));
  }
  actions.append(btn('ws.clearCell', '▢', () => { d.cells[i] = null; renderDesk(); saveDesk(); }));
  head.append(actions);
  cell.append(head);
  if (info.kind === 'web') {
    cell.append(el('div', { class: 'ws-body web-slot', 'data-ws': ws.id }, l.webState.error ? el('div', { class: 'web-err' }, l.webState.error) : el('div', { class: 'web-loading' }, t('common.loading'))));
  } else {
    cell.append(l.body);
    if (info.kind === 'term') requestAnimationFrame(() => l.startTerm());
  }
  return cell;
}
function renderChrome() {
  if (!project()) return;
  const d = desk();
  const visible = d.cells.slice(0, d.layout);
  $('#ws-chips').replaceChildren(...d.workspaces.map((w) => {
    const info = wsInfo(w.type);
    const l = live.get(w.id);
    const x = el('button', { class: 'x', title: t('ws.remove') }, '×');
    x.onclick = (e) => { e.stopPropagation(); removeWorkspace(w.id); };
    return el('div', { class: 'ws-chip' + (visible.includes(w.id) ? ' shown' : ''), style: { '--wc': info.color }, title: `${info.label}: ${w.title}\n${t('ws.chipHint')}`, onclick: () => placeInFocus(w.id) },
      el('span', {}, info.icon), el('span', { class: 'label' }, w.title),
      l?.busy ? el('span', { class: 'busy' }) : null, l?.waiting ? el('span', { class: 'waiting' }, '!') : null,
      !l?.busy && !l?.waiting && l?.done ? el('span', { class: 'done', title: t('status.done') }, '✓') : null, x);
  }));
  for (const c of document.querySelectorAll('.cell')) {
    const idx = [...c.parentNode.children].indexOf(c);
    const ws = d.cells[idx] && wsById(d.cells[idx]);
    const title = c.querySelector('.ch-title');
    if (ws && title) { title.textContent = ws.title; title.title = ws.title; }
  }
}

// Native Web-Ansichten an die DOM-Platzhalter anpassen
function layoutWeb() {
  if (overlayOpen || modalOpen) return;
  const shown = new Set();
  for (const slot of document.querySelectorAll('.web-slot')) {
    const id = slot.dataset.ws;
    const r = slot.getBoundingClientRect();
    window.nexus.webBounds(id, { x: r.left, y: r.top, width: r.width, height: r.height });
    shown.add(id);
  }
  for (const [id, l] of live) if (wsInfo(l.type).kind === 'web' && !shown.has(id)) window.nexus.webBounds(id, null);
}
function fitTerms() { for (const l of live.values()) if (l.term && l.termId && l.body.isConnected) l.fit.fit(); }
new ResizeObserver(() => { layoutWeb(); fitTerms(); }).observe($('#grid'));

// Titel der Web-KIs: Anbieter-Zusaetze entfernen; Start-/Login-Seiten bekommen den Anbieternamen
const GENERIC_TITLE = /^(Claude|ChatGPT|Gemini|Google Gemini|Neue Sitzung|New chat|Neuer Chat|New conversation)$/i;
const LOGIN_TITLE = /^ChatGPT:|Anmelden|Log in|Sign in|Sign up|Konto erstellen|Create account/i;
window.nexus.onWebState((wsId, s) => {
  const l = live.get(wsId);
  if (!l) return;
  l.webState = { ...l.webState, ...s };
  const d = state.desks[l.projectId];
  const ws = d && wsById(wsId, d);
  if (!ws) return;
  let changed = false;
  if (s.url && s.url !== ws.url && /^https:\/\//.test(s.url)) { ws.url = s.url; changed = true; }
  if (s.title) {
    let title = s.title.replace(/\s*[-|–]\s*(Claude(\.ai)?|ChatGPT|Gemini|Google Gemini)\s*$/i, '').trim();
    const label = wsInfo(ws.type).label;
    if (title.endsWith(' - ' + label)) title = title.slice(0, -(label.length + 3)).trim();
    if (s.auth || !title || title === label || GENERIC_TITLE.test(title) || LOGIN_TITLE.test(title)) title = label;
    if (title !== ws.title) { ws.title = title.slice(0, 80); changed = true; }
  }
  if (changed) { saveDeskFor(l.projectId); if (l.projectId === state.project) renderChrome(); }
  const slot = document.querySelector(`.web-slot[data-ws="${wsId}"]`);
  if (slot) slot.replaceChildren(s.error ? el('div', { class: 'web-err' }, t('web.errorHint', { error: s.error })) : el('div', { class: 'web-loading' }, s.loading ? t('common.loading') : ''));
});

// Terminal-Ereignisse
window.nexus.onData((id, x) => { for (const l of live.values()) if (l.termId === id) l.term.write(x); });
window.nexus.onExit((id, code) => { for (const l of live.values()) if (l.termId === id) l.term.write(`\r\n\x1b[90m[${t('term.exited', { code })}]\x1b[0m\r\n`); });
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
// Klick auf die Windows-Benachrichtigung: Projekt und Chat zeigen, der auf eine Entscheidung wartet
window.nexus.onFocusChat(async (chatId) => {
  const entry = [...live].find(([, l]) => l.view && l.view.chatId === chatId);
  if (!entry) return;
  const [wsId, l] = entry;
  if (state.project !== l.projectId) await selectProject(l.projectId);
  placeInFocus(wsId);
  l.view.scrollDown();
});

// ---------- Leiste: Workspace hinzufuegen ----------
$('#add-ws').onclick = (e) => {
  e.stopPropagation();
  if (!project()) return;
  openOverlay($('#add-ws'), [el('div', { class: 'menu' }, el('div', { class: 'menu-label' }, t('desk.addWs')),
    ...addableTypes().map(([type, info]) => el('button', { class: 'menu-item', style: { '--wc': info.color }, onclick: (ev) => { ev.stopPropagation(); closeOverlay(); addWorkspace(type); } },
      el('span', { class: 'mi-icon' }, info.icon), el('span', {}, info.label),
      el('span', { class: 'mi-sub' }, info.kind === 'web' ? statusText(type) : info.kind === 'chat' ? t('desk.kindChat') : t('desk.kindTerm')))),
    el('button', { class: 'menu-item', style: { '--wc': '#6366f1' }, onclick: (ev) => { ev.stopPropagation(); closeOverlay(); openAiManager(); } },
      el('span', { class: 'mi-icon' }, '＋'), el('span', {}, t('ai.addButton') + '…')))]);
};
$('#open-folder').onclick = () => { if (state.project) window.nexus.openFolder(state.project); };
