/* global Terminal, FitAddon */
const $ = (s) => document.querySelector(s);
const state = {
  projects: [], sessionMeta: {}, palette: [], icons: [],
  activeProject: null, sessions: [], filterColor: null, search: '',
  tabs: [], activeTab: null, // { termId, projectId, sessionId, title, term, fit, el, exited }
};

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

function relTime(ms) {
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return 'gerade eben';
  if (d < 3600) return `vor ${Math.floor(d / 60)} Min.`;
  if (d < 86400) return `vor ${Math.floor(d / 3600)} Std.`;
  if (d < 86400 * 7) return `vor ${Math.floor(d / 86400)} Tg.`;
  return new Date(ms).toLocaleDateString('de-DE');
}

function project(id) { return state.projects.find((p) => p.id === id); }

// ---------- Popover (Farb-/Icon-Auswahl) ----------
function showPopover(anchor, options, onPick) {
  const pop = $('#popover');
  pop.replaceChildren(...options.map((o) => {
    const b = o.color
      ? el('button', { class: 'opt', title: o.title || o.color, style: { background: o.color } })
      : el('button', { class: 'emoji', title: o.title || '' }, o.text);
    b.onclick = (e) => { e.stopPropagation(); pop.hidden = true; onPick(o); };
    return b;
  }));
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.min(r.left, innerWidth - 260)}px`;
  pop.style.top = `${r.bottom + 6}px`;
  pop.hidden = false;
}
document.addEventListener('click', () => { $('#popover').hidden = true; });

// ---------- Projekte ----------
function renderProjects() {
  $('#project-list').replaceChildren(...state.projects.map((p) => {
    const openCount = state.tabs.filter((t) => t.projectId === p.id && !t.exited).length;
    return el('div', {
      class: 'project' + (p.id === state.activeProject ? ' active' : ''),
      style: { '--pc': p.color },
      onclick: () => selectProject(p.id),
    }, el('span', { class: 'icon' }, p.icon), el('span', { class: 'name' }, p.name),
       openCount ? el('span', { class: 'count', title: 'offene Terminals' }, `● ${openCount}`) : null);
  }));
}

async function selectProject(id) {
  state.activeProject = id;
  const p = project(id);
  document.body.style.setProperty('--pc', p.color);
  renderProjects();
  renderProjectHead();
  $('#session-list').replaceChildren(el('div', { class: 'group-label' }, 'Lädt…'));
  state.sessions = await window.nexus.listSessions(id);
  renderSessions();
}

function renderProjectHead() {
  const p = project(state.activeProject);
  const icon = el('span', { class: 'icon', title: 'Icon ändern' }, p.icon);
  icon.onclick = (e) => {
    e.stopPropagation();
    showPopover(icon, state.icons.map((t) => ({ text: t })), async (o) => {
      Object.assign(p, await window.nexus.updateProject(p.id, { icon: o.text }));
      renderProjects(); renderProjectHead(); renderTabs();
    });
  };
  const sw = el('span', { class: 'swatch', title: 'Projektfarbe ändern', style: { '--pc': p.color } });
  sw.onclick = (e) => {
    e.stopPropagation();
    showPopover(sw, state.palette.map((c) => ({ color: c })), async (o) => {
      Object.assign(p, await window.nexus.updateProject(p.id, { color: o.color }));
      document.body.style.setProperty('--pc', p.color);
      renderProjects(); renderProjectHead(); renderTabs(); renderSessions();
    });
  };
  const folder = el('button', { title: 'Ordner öffnen' }, '📁');
  folder.onclick = () => window.nexus.openFolder(p.id);
  const head = $('#project-head');
  head.style.setProperty('--pc', p.color);
  head.replaceChildren(icon, el('h2', {}, p.name), sw, folder);
}

// ---------- Sitzungen ----------
function renderColorFilter() {
  const chips = [el('span', { class: 'chip all' + (state.filterColor ? '' : ' on'), title: 'Alle' })];
  chips[0].onclick = () => { state.filterColor = null; renderSessions(); };
  for (const c of state.palette) {
    const chip = el('span', { class: 'chip' + (state.filterColor === c ? ' on' : ''), style: { background: c }, title: 'Nur diese Farbe' });
    chip.onclick = () => { state.filterColor = state.filterColor === c ? null : c; renderSessions(); };
    chips.push(chip);
  }
  $('#color-filter').replaceChildren(...chips);
}

function sessionRow(s) {
  const meta = state.sessionMeta[s.id] || {};
  const p = project(state.activeProject);
  const isOpen = state.tabs.some((t) => t.sessionId === s.id && !t.exited);
  const colorBtn = el('button', { title: 'Farbe markieren' }, '🎨');
  colorBtn.onclick = (e) => {
    e.stopPropagation();
    showPopover(colorBtn, [{ color: '#2a2d37', title: 'keine', none: true }, ...state.palette.map((c) => ({ color: c }))], async (o) => {
      state.sessionMeta[s.id] = await window.nexus.updateSessionMeta(s.id, { color: o.none ? null : o.color });
      renderSessions();
    });
  };
  const pinBtn = el('button', { title: meta.pinned ? 'Lösen' : 'Anheften', class: meta.pinned ? 'pinned' : '' }, meta.pinned ? '📌' : '📍');
  pinBtn.onclick = async (e) => {
    e.stopPropagation();
    state.sessionMeta[s.id] = await window.nexus.updateSessionMeta(s.id, { pinned: !meta.pinned });
    renderSessions();
  };
  return el('div', {
    class: 'session' + (isOpen ? ' open' : ''),
    style: { '--sc': meta.color || 'transparent', '--pc': p.color },
    title: s.title,
    onclick: () => openSession(s),
  },
  el('div', { class: 'title' }, (meta.pinned ? '📌 ' : '') + s.title),
  el('div', { class: 'meta' }, `${relTime(s.updated)} · ${s.prompts} Prompts${s.branch && s.branch !== 'HEAD' ? ' · ' + s.branch : ''}`),
  el('div', { class: 'actions' }, colorBtn, pinBtn));
}

function renderSessions() {
  renderColorFilter();
  const q = state.search.toLowerCase();
  const list = state.sessions.filter((s) => {
    const m = state.sessionMeta[s.id] || {};
    if (state.filterColor && m.color !== state.filterColor) return false;
    return !q || s.title.toLowerCase().includes(q);
  });
  const pinned = list.filter((s) => state.sessionMeta[s.id]?.pinned);
  const rest = list.filter((s) => !state.sessionMeta[s.id]?.pinned);
  const out = [];
  if (pinned.length) out.push(el('div', { class: 'group-label' }, 'Angeheftet'), ...pinned.map(sessionRow));
  out.push(el('div', { class: 'group-label' }, `Sitzungen (${rest.length})`), ...rest.map(sessionRow));
  if (!state.sessions.length) out.push(el('div', { class: 'group-label' }, 'Noch keine Claude-Code-Sitzungen in diesem Projekt.'));
  $('#session-list').replaceChildren(...out);
}

$('#search').addEventListener('input', (e) => { state.search = e.target.value; renderSessions(); });

// ---------- Terminals ----------
function openSession(s) {
  const existing = state.tabs.find((t) => t.sessionId === s.id && !t.exited);
  if (existing) return activateTab(existing.termId);
  return startTerminal({ sessionId: s.id, title: s.title });
}
$('#new-session').onclick = () => state.activeProject && startTerminal({ sessionId: null, title: 'Neue Sitzung' });

async function startTerminal({ sessionId, title }) {
  const projectId = state.activeProject;
  const p = project(projectId);
  $('#empty').hidden = true;
  const box = el('div', { class: 'term' });
  $('#terminals').append(box);
  const term = new Terminal({
    fontFamily: 'Cascadia Mono, Consolas, monospace', fontSize: 13, cursorBlink: true, allowProposedApi: true,
    theme: { background: '#111216', foreground: '#e7e8ec', cursor: p.color, selectionBackground: p.color + '55' },
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(box);
  box.classList.add('active');
  fit.fit();
  const termId = await window.nexus.openTerminal({ projectId, resumeId: sessionId, cols: term.cols, rows: term.rows });
  term.onData((d) => window.nexus.input(termId, d));
  term.onResize(({ cols, rows }) => window.nexus.resize(termId, cols, rows));
  const tab = { termId, projectId, sessionId, title, term, fit, el: box, exited: false };
  state.tabs.push(tab);
  activateTab(termId);
  renderProjects();
  if (state.activeProject === projectId) renderSessions();
}

function activateTab(termId) {
  state.activeTab = termId;
  for (const t of state.tabs) t.el.classList.toggle('active', t.termId === termId);
  renderTabs();
  const t = state.tabs.find((x) => x.termId === termId);
  if (t) { requestAnimationFrame(() => { t.fit.fit(); t.term.focus(); }); }
}

function closeTab(termId) {
  const t = state.tabs.find((x) => x.termId === termId);
  if (!t) return;
  if (!t.exited) window.nexus.kill(termId);
  t.term.dispose(); t.el.remove();
  state.tabs = state.tabs.filter((x) => x !== t);
  if (state.activeTab === termId) {
    const next = state.tabs[state.tabs.length - 1];
    if (next) activateTab(next.termId); else { state.activeTab = null; $('#empty').hidden = false; }
  }
  renderTabs(); renderProjects();
  if (state.activeProject) renderSessions();
}

function renderTabs() {
  $('#tabs').replaceChildren(...state.tabs.map((t) => {
    const p = project(t.projectId);
    const x = el('button', { class: 'x', title: 'Schließen' }, '×');
    x.onclick = (e) => { e.stopPropagation(); closeTab(t.termId); };
    return el('div', {
      class: 'tab' + (t.termId === state.activeTab ? ' active' : '') + (t.exited ? ' exited' : ''),
      style: { '--pc': p.color }, title: `${p.name} – ${t.title}`,
      onclick: () => activateTab(t.termId),
    }, el('span', {}, p.icon), el('span', { class: 'label' }, t.title), x);
  }));
}

window.nexus.onData((id, d) => state.tabs.find((t) => t.termId === id)?.term.write(d));
window.nexus.onExit((id, code) => {
  const t = state.tabs.find((x) => x.termId === id);
  if (!t) return;
  t.exited = true;
  t.term.write(`\r\n\x1b[90m[Claude Code beendet, Code ${code}]\x1b[0m\r\n`);
  renderTabs(); renderProjects();
  if (state.activeProject) window.nexus.listSessions(state.activeProject).then((s) => { state.sessions = s; renderSessions(); });
});
window.addEventListener('resize', () => state.tabs.find((t) => t.termId === state.activeTab)?.fit.fit());

// ---------- Start ----------
(async () => {
  Object.assign(state, await window.nexus.getState());
  renderProjects();
  const first = state.projects.find((p) => p.name === 'NEXUS') || state.projects[0];
  if (first) selectProject(first.id);
})();
