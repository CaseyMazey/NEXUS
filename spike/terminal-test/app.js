/* global Terminal, FitAddon, marked, DOMPurify */
const $ = (s) => document.querySelector(s);
const state = {
  projects: [], sessionMeta: {}, palette: [], icons: [],
  activeProject: null, sessions: [], filterColor: null, search: '',
  tabs: [], activeTab: null,
  usage: null, // letzter rate_limit_event
};
let tabSeq = 1;

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
function md(text) {
  const html = DOMPurify.sanitize(marked.parse(text || '', { gfm: true, breaks: true }));
  const div = el('div', { class: 'md' });
  div.innerHTML = html;
  div.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
  return div;
}

// ---------- Popover ----------
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
       openCount ? el('span', { class: 'count', title: 'offene Tabs' }, `● ${openCount}`) : null);
  }));
}
async function selectProject(id) {
  state.activeProject = id;
  const p = project(id);
  document.body.style.setProperty('--pc', p.color);
  renderProjects(); renderProjectHead();
  $('#session-list').replaceChildren(el('div', { class: 'group-label' }, 'Lädt…'));
  state.sessions = await window.nexus.listSessions(id);
  renderSessions();
}
async function refreshSessions() {
  if (!state.activeProject) return;
  state.sessions = await window.nexus.listSessions(state.activeProject);
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

// ---------- Sitzungsliste ----------
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
  const pinBtn = el('button', { title: meta.pinned ? 'Lösen' : 'Anheften' }, meta.pinned ? '📌' : '📍');
  pinBtn.onclick = async (e) => {
    e.stopPropagation();
    state.sessionMeta[s.id] = await window.nexus.updateSessionMeta(s.id, { pinned: !meta.pinned });
    renderSessions();
  };
  const termBtn = el('button', { title: 'Im Terminal öffnen' }, '⌨');
  termBtn.onclick = (e) => { e.stopPropagation(); openSession(s, 'terminal'); };
  return el('div', {
    class: 'session' + (isOpen ? ' open' : ''),
    style: { '--sc': meta.color || 'transparent', '--pc': p.color },
    title: s.title,
    onclick: () => openSession(s, 'chat'),
  },
  el('div', { class: 'title' }, (meta.pinned ? '📌 ' : '') + s.title),
  el('div', { class: 'meta' }, `${relTime(s.updated)} · ${s.prompts} Prompts${s.branch && s.branch !== 'HEAD' ? ' · ' + s.branch : ''}`),
  el('div', { class: 'actions' }, colorBtn, pinBtn, termBtn));
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

function openSession(s, kind) {
  const existing = state.tabs.find((t) => t.sessionId === s.id && !t.exited && t.kind === kind);
  if (existing) return activateTab(existing.key);
  return kind === 'chat' ? startChat({ sessionId: s.id, title: s.title }) : startTerminal({ sessionId: s.id, title: s.title });
}
$('#new-session').onclick = () => state.activeProject && startChat({ sessionId: null, title: 'Neuer Chat' });
$('#new-terminal').onclick = () => state.activeProject && startTerminal({ sessionId: null, title: 'Terminal' });

// ---------- Tabs ----------
function addTab(tab) {
  tab.key = 't' + tabSeq++;
  state.tabs.push(tab);
  $('#empty').hidden = true;
  activateTab(tab.key);
  renderProjects();
  if (state.activeProject === tab.projectId) renderSessions();
  return tab;
}
function activateTab(key) {
  state.activeTab = key;
  for (const t of state.tabs) t.el.classList.toggle('active', t.key === key);
  renderTabs();
  const t = state.tabs.find((x) => x.key === key);
  if (!t) return;
  requestAnimationFrame(() => {
    if (t.kind === 'terminal') { t.fit.fit(); t.term.focus(); } else { t.input.focus(); t.scrollDown(); }
  });
}
function closeTab(key) {
  const t = state.tabs.find((x) => x.key === key);
  if (!t) return;
  if (t.kind === 'terminal') { if (!t.exited) window.nexus.kill(t.termId); t.term.dispose(); }
  else window.nexus.chatClose(t.chatId);
  t.el.remove();
  state.tabs = state.tabs.filter((x) => x !== t);
  if (state.activeTab === key) {
    const next = state.tabs[state.tabs.length - 1];
    if (next) activateTab(next.key); else { state.activeTab = null; $('#empty').hidden = false; }
  }
  renderTabs(); renderProjects();
  if (state.activeProject) renderSessions();
}
function renderTabs() {
  $('#tabs').replaceChildren(...state.tabs.map((t) => {
    const p = project(t.projectId);
    const x = el('button', { class: 'x', title: 'Schließen' }, '×');
    x.onclick = (e) => { e.stopPropagation(); closeTab(t.key); };
    const busy = t.kind === 'chat' && t.busy ? el('span', { class: 'busy', title: 'arbeitet…' }) : null;
    const waiting = t.kind === 'chat' && t.waitingPermission ? el('span', { class: 'waiting', title: 'wartet auf deine Freigabe' }, '!') : null;
    return el('div', {
      class: 'tab' + (t.key === state.activeTab ? ' active' : '') + (t.exited ? ' exited' : ''),
      style: { '--pc': p.color }, title: `${p.name} – ${t.title}`,
      onclick: () => activateTab(t.key),
    }, el('span', {}, t.kind === 'terminal' ? '⌨' : p.icon), el('span', { class: 'label' }, t.title), busy, waiting, x);
  }));
}

// ---------- Terminal-Tabs ----------
async function startTerminal({ sessionId, title }) {
  const projectId = state.activeProject;
  const p = project(projectId);
  const box = el('div', { class: 'pane term' });
  $('#terminals').append(box);
  const term = new Terminal({
    fontFamily: 'Cascadia Mono, Consolas, monospace', fontSize: 13, cursorBlink: true,
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
  addTab({ kind: 'terminal', termId, projectId, sessionId, title, term, fit, el: box, exited: false });
}
window.nexus.onData((id, d) => state.tabs.find((t) => t.termId === id)?.term.write(d));
window.nexus.onExit((id, code) => {
  const t = state.tabs.find((x) => x.termId === id);
  if (!t) return;
  t.exited = true;
  t.term.write(`\r\n\x1b[90m[Claude Code beendet, Code ${code}]\x1b[0m\r\n`);
  renderTabs(); renderProjects(); refreshSessions();
});

// ---------- Chat-Tabs ----------
const TOOL_ICONS = { Read: '📖', Write: '📝', Edit: '✏️', MultiEdit: '✏️', Bash: '💻', PowerShell: '💻', Glob: '🔎', Grep: '🔎', WebFetch: '🌐', WebSearch: '🌐', Task: '🤖', Agent: '🤖', TodoWrite: '✅' };
function toolSummary(name, input = {}) {
  const v = input.file_path || input.path || input.command || input.pattern || input.url || input.query || input.description || input.prompt || '';
  return String(v).replace(/^.*[\\/](?=[^\\/]+$)/, (m) => (input.file_path || input.path ? '' : m)).slice(0, 120);
}
function toolCard(item) {
  const card = el('details', { class: 'tool' + (item.isError ? ' error' : '') });
  const sum = el('summary', {}, el('span', { class: 'ti' }, TOOL_ICONS[item.name] || '🔧'), el('b', {}, item.name), el('span', { class: 'ts' }, toolSummary(item.name, item.input)));
  card.append(sum);
  const body = el('div', { class: 'tool-body' });
  body.append(el('pre', {}, JSON.stringify(item.input, null, 2).slice(0, 6000)));
  if (item.result != null) body.append(el('div', { class: 'tool-result-label' }, item.isError ? 'Fehler' : 'Ergebnis'), el('pre', {}, String(item.result).slice(0, 6000)));
  card.append(body);
  card._body = body;
  return card;
}

async function startChat({ sessionId, title }) {
  const projectId = state.activeProject;
  const p = project(projectId);
  const pane = el('div', { class: 'pane chat' });
  const log = el('div', { class: 'chat-log' });
  const inner = el('div', { class: 'chat-inner' });
  log.append(inner);
  const input = el('textarea', { rows: '1', placeholder: `Nachricht an Claude Code in ${p.name}…  (Enter = senden, Shift+Enter = neue Zeile)` });
  const sendBtn = el('button', { class: 'send', title: 'Senden' }, '↑');
  const stopBtn = el('button', { class: 'stop', title: 'Stoppen', hidden: '' }, '■');
  const modeSel = el('select', { title: 'Berechtigungen' },
    el('option', { value: 'default' }, 'Bei Änderungen fragen'),
    el('option', { value: 'acceptEdits' }, 'Änderungen automatisch'),
    el('option', { value: 'plan' }, 'Nur planen'));
  const usage = el('div', { class: 'usage' });
  const composer = el('div', { class: 'composer' },
    el('div', { class: 'composer-box' }, input, el('div', { class: 'composer-actions' }, modeSel, usage, stopBtn, sendBtn)));
  pane.append(log, composer);
  $('#terminals').append(pane);

  const tab = { kind: 'chat', projectId, sessionId, title, el: pane, input, busy: false, exited: false };
  tab.scrollDown = () => { log.scrollTop = log.scrollHeight; };
  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 120;
  const append = (node) => { const stick = nearBottom(); inner.append(node); if (stick) tab.scrollDown(); return node; };
  const tools = new Map();
  let live = null; // laufender Assistant-Textblock { el, text }

  function setBusy(b) {
    tab.busy = b;
    stopBtn.hidden = !b; sendBtn.hidden = b;
    renderTabs();
  }
  function addUser(text) { append(el('div', { class: 'msg user' }, el('div', { class: 'bubble' }, text))); }
  function addAssistant(text) { append(el('div', { class: 'msg assistant' }, md(text))); }
  function addTool(item) { const c = toolCard(item); tools.set(item.id, { card: c, item }); append(c); }
  function addNote(text, cls = '') { append(el('div', { class: 'note ' + cls }, text)); }

  // Verlauf (bei fortgesetzter Sitzung)
  const res = await window.nexus.openChat({ projectId, resumeId: sessionId, mode: 'default' });
  tab.chatId = res.chatId;
  if (res.history.length) {
    addNote(`Fortgesetzte Sitzung · ${res.history.length} Einträge aus dem Verlauf`);
    for (const it of res.history) {
      if (it.kind === 'user') addUser(it.text);
      else if (it.kind === 'assistant') addAssistant(it.text);
      else addTool(it);
    }
  } else {
    append(el('div', { class: 'welcome' }, el('div', { class: 'wicon', style: { background: p.color + '33' } }, p.icon),
      el('h3', {}, p.name), el('p', {}, 'Neuer Claude-Code-Chat in diesem Projektordner.')));
  }

  function send() {
    const text = input.value.trim();
    if (!text || tab.busy || tab.exited) return;
    addUser(text); tab.scrollDown();
    input.value = ''; input.style.height = '';
    setBusy(true);
    window.nexus.chatSend(tab.chatId, text);
    if (tab.title === 'Neuer Chat') { tab.title = text.slice(0, 40); renderTabs(); }
  }
  sendBtn.onclick = send;
  stopBtn.onclick = () => window.nexus.chatInterrupt(tab.chatId);
  modeSel.onchange = () => window.nexus.chatMode(tab.chatId, modeSel.value);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  input.addEventListener('input', () => { input.style.height = ''; input.style.height = Math.min(input.scrollHeight, 220) + 'px'; });

  tab.handle = (ev) => {
    if (ev.type === 'message-start' && !ev.parent) { live = null; return; }
    if (ev.type === 'text-delta' && !ev.parent) {
      if (!live) { live = { text: '', el: append(el('div', { class: 'msg assistant streaming' })) }; }
      live.text += ev.text;
      const stick = nearBottom();
      live.el.replaceChildren(md(live.text));
      if (stick) tab.scrollDown();
      return;
    }
    if (ev.type === 'permission') {
      tab.waitingPermission = true; renderTabs();
      const always = ev.suggestions.find((s) => s.type === 'setMode' && s.mode === 'acceptEdits') ? 'Änderungen in diesem Chat immer erlauben' : (ev.suggestions.length ? 'Immer erlauben' : null);
      const card = el('div', { class: 'perm' },
        el('div', { class: 'perm-head' }, el('span', {}, TOOL_ICONS[ev.tool] || '🔐'), el('b', {}, `Claude möchte ${ev.displayName || ev.tool} verwenden`)),
        el('div', { class: 'perm-desc' }, ev.description || toolSummary(ev.tool, ev.input)),
        el('details', {}, el('summary', {}, 'Details'), el('pre', {}, JSON.stringify(ev.input, null, 2).slice(0, 6000))));
      const btns = el('div', { class: 'perm-btns' });
      const decide = (decision, label) => {
        window.nexus.chatPermission(tab.chatId, ev.requestId, decision);
        btns.replaceChildren(el('span', { class: 'perm-done' }, label));
        card.classList.add(decision === 'deny' ? 'denied' : 'allowed');
        tab.waitingPermission = false; renderTabs();
      };
      btns.append(el('button', { class: 'primary', onclick: () => decide('allow', '✓ Erlaubt') }, 'Erlauben'));
      if (always) btns.append(el('button', { onclick: () => decide('always', '✓ Immer erlaubt') }, always));
      btns.append(el('button', { class: 'danger', onclick: () => decide('deny', '✗ Abgelehnt') }, 'Ablehnen'));
      card.append(btns);
      append(card); tab.scrollDown();
      return;
    }
    if (ev.type === 'raw') {
      const d = ev.data;
      if (d.type === 'system' && d.subtype === 'init') { tab.sessionId = d.session_id; return; }
      if (d.type === 'rate_limit_event') { state.usage = d.rate_limit_info; renderUsage(); return; }
      if (d.type === 'assistant' && !d.parent_tool_use_id) {
        for (const c of d.message?.content || []) {
          if (c.type === 'text' && c.text) {
            if (live) { live.el.classList.remove('streaming'); live.el.replaceChildren(md(c.text)); live = null; }
            else addAssistant(c.text);
          }
          if (c.type === 'tool_use' && !tools.has(c.id)) { live = null; addTool({ id: c.id, name: c.name, input: c.input }); }
        }
        return;
      }
      if (d.type === 'user' && Array.isArray(d.message?.content)) {
        for (const c of d.message.content) {
          if (c.type !== 'tool_result') continue;
          const t = tools.get(c.tool_use_id);
          if (!t) continue;
          const text = typeof c.content === 'string' ? c.content : (c.content || []).map((x) => x.text || '').join('\n');
          t.card.classList.toggle('error', !!c.is_error);
          t.card._body.append(el('div', { class: 'tool-result-label' }, c.is_error ? 'Fehler' : 'Ergebnis'), el('pre', {}, text.slice(0, 6000)));
        }
        return;
      }
      if (d.type === 'system' && d.subtype === 'permission_denied') { addNote(`Nicht erlaubt: ${d.tool_name}`, 'warn'); return; }
      if (d.type === 'result') {
        live = null; setBusy(false);
        if (d.is_error || d.subtype !== 'success') addNote(`Abgebrochen: ${d.subtype}${d.result ? ' – ' + String(d.result).slice(0, 200) : ''}`, 'warn');
        const secs = Math.round((d.duration_ms || 0) / 1000);
        addNote(`${d.num_turns || 1} Schritt(e) · ${secs} s`, 'meta');
        refreshSessions();
        return;
      }
      return;
    }
    if (ev.type === 'nexus-stderr') { if (/error|fehler/i.test(ev.text)) addNote(ev.text.trim().slice(0, 400), 'warn'); return; }
    if (ev.type === 'nexus-exit' || ev.type === 'nexus-error') {
      tab.exited = true; setBusy(false);
      addNote(ev.type === 'nexus-error' ? `Claude Code konnte nicht starten: ${ev.message}` : `Claude Code beendet (Code ${ev.code}). Tab schließen und Sitzung erneut öffnen, um weiterzumachen.`, 'warn');
      input.disabled = true;
      renderTabs(); renderProjects();
    }
  };
  addTab(tab);
  flushEarly(tab);
  renderUsage();
}

function renderUsage() {
  const u = state.usage?.unifiedWindows;
  for (const t of state.tabs) {
    if (t.kind !== 'chat') continue;
    const box = t.el.querySelector('.usage');
    if (!box) continue;
    if (!u) { box.textContent = ''; continue; }
    const f = (w, label) => (w ? `${label} ${Math.round(w.utilization * 100)} %` : '');
    box.textContent = [f(u.five_hour, '5 Std.'), f(u.seven_day, 'Woche')].filter(Boolean).join(' · ');
    box.title = 'Nutzung deines Claude-Abos';
  }
}
const earlyEvents = new Map(); // chatId -> Ereignisse, bevor der Tab bereit ist
window.nexus.onChatEvent((chatId, ev) => {
  const t = state.tabs.find((x) => x.kind === 'chat' && x.chatId === chatId);
  if (t?.handle) return t.handle(ev);
  if (!earlyEvents.has(chatId)) earlyEvents.set(chatId, []);
  earlyEvents.get(chatId).push(ev);
});
function flushEarly(tab) {
  const list = earlyEvents.get(tab.chatId);
  earlyEvents.delete(tab.chatId);
  for (const ev of list || []) tab.handle(ev);
}
window.addEventListener('resize', () => { const t = state.tabs.find((x) => x.key === state.activeTab); if (t?.kind === 'terminal') t.fit.fit(); });

// ---------- Start ----------
(async () => {
  Object.assign(state, await window.nexus.getState());
  renderProjects();
  const first = state.projects.find((p) => p.name === 'NEXUS') || state.projects[0];
  if (first) selectProject(first.id);
})();
