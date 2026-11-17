// Seitenleiste: Projekte (anlegen, bearbeiten, entfernen) und Claude-Code-Sitzungen.

// Zeichen am Projektnamen: KI arbeitet (pulsiert), wartet auf dich (!), fertig und noch nicht angesehen (✓)
function statusBadge(s) {
  if (!s) return null;
  return el('span', { class: 'p-status ' + s, title: t(`status.${s}`) }, s === 'waiting' ? '!' : s === 'done' ? '✓' : '');
}
// Gruppen: Projekte ohne Gruppe oben, dann die Gruppen alphabetisch (ein-/ausklappbar)
const groupsOf = () => [...new Set(state.projects.map((p) => p.group || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, locale()));
const isCollapsed = (g) => (state.settings.collapsedGroups || []).includes(g);
// Reihenfolge wie in der Seitenleiste (fuer mod+1…9)
const byName = (a, b) => a.name.localeCompare(b.name, locale(), { numeric: true });
const membersOf = (g) => state.projects.filter((p) => (p.group || '') === g).sort(byName);
function sidebarOrder() {
  return [...membersOf(''), ...groupsOf().flatMap(membersOf)];
}
async function toggleGroup(g) {
  const list = new Set(state.settings.collapsedGroups || []);
  if (list.has(g)) list.delete(g); else list.add(g);
  state.settings = await window.nexus.setSetting('collapsedGroups', [...list]);
  renderProjects();
}
// Status einer ganzen Gruppe (fuer eingeklappte Gruppen): wartet > arbeitet > fertig
function groupStatus(g) {
  const all = state.projects.filter((p) => p.group === g).map((p) => projectStatus(p.id));
  return ['waiting', 'busy', 'done'].find((s) => all.includes(s)) || null;
}
function renderProjects() {
  const row = (p) => {
    const d = state.desks[p.id];
    const count = d ? d.workspaces.length : 0;
    const edit = el('button', { class: 'p-edit', title: t('project.edit') }, '✎');
    edit.onclick = (e) => { e.stopPropagation(); openProjectEditor(p); };
    return el('div', { class: 'project' + (p.id === state.project ? ' active' : '') + (p.missing ? ' missing' : ''), style: { '--pc': p.color },
      title: p.missing ? t('project.missing', { path: p.path }) : p.path,
      onclick: () => selectProject(p.id), oncontextmenu: (e) => { e.preventDefault(); openProjectEditor(p); } },
      el('span', { class: 'icon' }, p.icon), el('span', { class: 'name' }, p.name),
      p.missing ? el('span', { class: 'p-warn' }, '⚠') : null,
      statusBadge(projectStatus(p.id)),
      count ? el('span', { class: 'count', title: t('project.wsCount') }, String(count)) : null, edit);
  };
  const rows = membersOf('').map(row);
  for (const g of groupsOf()) {
    const members = membersOf(g);
    const closed = isCollapsed(g) && !members.some((p) => p.id === state.project);
    rows.push(el('div', { class: 'p-group' + (closed ? ' closed' : ''), title: t(closed ? 'group.expand' : 'group.collapse'), onclick: () => toggleGroup(g) },
      el('span', { class: 'g-arrow' }, closed ? '▸' : '▾'), el('span', { class: 'g-name' }, g),
      closed ? statusBadge(groupStatus(g)) : null, el('span', { class: 'g-count' }, String(members.length))));
    if (!closed) rows.push(...members.map((p) => { const r = row(p); r.classList.add('in-group'); return r; }));
  }
  $('#project-list').replaceChildren(...(rows.length ? rows : [el('div', { class: 'side-note' }, t('project.none'))]));
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
    mode: 'new', folder: p?.path || '', group: p?.group || '' };
  let error = '';
  let unlisted = [];
  let busy = false;
  const base = (dir) => dir.split(/[\\/]/).pop();
  const newPath = () => `${state.projectRoot}\\${f.name.trim() || '…'}`;
  const pick = async () => { const dir = await window.nexus.pickFolder(f.folder || state.projectRoot); if (dir) { f.folder = dir; if (!f.name.trim()) f.name = base(dir); f.mode = 'existing'; render(); } };
  const save = async () => {
    if (busy) return;
    error = '';
    busy = true;
    try {
      if (isNew) {
        const r = await window.nexus.createProject({ name: f.name, icon: f.icon, color: f.color, group: f.group, newFolder: f.mode === 'new', folder: f.mode === 'existing' ? f.folder : null });
        setProjects(r.projects);
        closeModal();
        renderProjects();
        state.project = null;
        selectProject(r.id);
      } else {
        const patch = { name: f.name, icon: f.icon, color: f.color, group: f.group };
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
    confirmDialog({
      title: t('project.removeTitle', { name: p.name }),
      text: (n ? tn('project.removeTextDesk', n) : t('project.removeText')) + '\n' + t('project.removeKeeps', { path: p.path }),
      yes: t('project.removeYes'), danger: true,
    }, () => removeProject(p));
  };
  const input = (key, props) => el('input', { ...props, value: f[key], oninput: (e) => { f[key] = e.target.value; } });
  const render = () => {
    const box = modalBox();
    const icons = el('div', { class: 'emojis p-icons' }, ...state.icons.map((ic) => el('button', { class: 'emoji' + (f.icon === ic ? ' on' : ''), onclick: () => { f.icon = ic; render(); } }, ic)));
    const colors = el('div', { class: 'swatches p-colors' }, ...state.palette.map((c) => el('button', { class: 'opt' + (f.color === c ? ' on' : ''), title: c, style: { background: c }, onclick: () => { f.color = c; render(); } })));
    const radio = (mode, label, extra) => el('label', { class: 'm-check' }, el('input', { type: 'radio', name: 'pmode', ...(f.mode === mode ? { checked: '' } : {}), onchange: () => { f.mode = mode; render(); } }), label, extra || null);
    const folderRow = el('div', { class: 'p-folder' }, el('code', {}, f.folder || t('project.noFolder')), el('button', { onclick: pick }, isNew ? t('project.pickFolder') : t('common.change')));
    const folderPart = isNew ? [
      radio('new', t('project.newFolder'), el('code', { class: 'p-hint' }, newPath())),
      radio('existing', t('project.existingFolder')),
      f.mode === 'existing' ? folderRow : null,
      f.mode === 'existing' && unlisted.length ? el('div', { class: 'p-unlisted' }, el('div', { class: 'm-sub' }, t('project.unlisted', { root: state.projectRoot })),
        ...unlisted.map((dir) => el('button', { class: 'p-chip' + (f.folder === dir ? ' on' : ''), onclick: () => { f.folder = dir; f.name = base(dir); render(); } }, base(dir)))) : null,
    ] : [folderRow, el('p', { class: 'm-sub' }, t('project.folderChangeHint'))];
    box.replaceChildren(...[
      el('div', { class: 'm-head' }, el('h2', {}, isNew ? t('project.newTitle') : t('project.edit')), el('button', { onclick: closeModal }, t('common.cancel'))),
      el('h3', {}, t('project.name')),
      input('name', { type: 'text', class: 'm-input', maxlength: '60', placeholder: t('project.namePlaceholder') }),
      el('h3', {}, t('project.folder')),
      ...folderPart,
      el('h3', {}, t('group.title')),
      input('group', { type: 'text', class: 'm-input m-group', maxlength: '40', list: 'nexus-groups', placeholder: t('group.placeholder') }),
      el('datalist', { id: 'nexus-groups' }, ...groupsOf().map((g) => el('option', { value: g }))),
      el('h3', {}, t('project.iconColor')),
      icons, colors,
      error ? el('div', { class: 'm-error' }, error) : null,
      el('div', { class: 'm-foot' },
        isNew ? null : el('button', { class: 'danger', style: { marginRight: 'auto' }, onclick: remove }, t('project.removeYes') + '…'),
        el('button', { class: 'primary', onclick: save }, isNew ? t('project.create') : t('common.save'))),
    ].filter(Boolean));
    const nameEl = box.querySelector('.m-input');
    // Hinweis "neuer Ordner" live mitschreiben, ohne das Eingabefeld neu aufzubauen
    nameEl.addEventListener('input', () => { const h = box.querySelector('.p-hint'); if (h) h.textContent = newPath(); });
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
  $('#desk-title').replaceChildren(el('span', { class: 'd-name' }, t('project.noProject')));
  $('#ws-chips').replaceChildren();
  $('#layouts').replaceChildren();
  $('#grid').className = 'layout-1';
  $('#grid').replaceChildren(el('div', { class: 'cell' }, el('div', { class: 'cell-empty welcome-empty' },
    el('div', { class: 'ce-title' }, t('welcome.title')),
    el('p', { class: 'm-sub' }, t('welcome.text')),
    el('div', { class: 'ce-btns' },
      el('button', { class: 'primary', onclick: () => openProjectEditor(null) }, '＋ ' + t('project.create')),
      el('button', { onclick: () => openAiManager() }, '＋ ' + t('ai.addButton'))))));
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
  $('#session-list').replaceChildren(el('div', { class: 'side-note' }, t('common.loading')));
  loadContext(id);
  state.sessions = await window.nexus.listSessions(id);
  renderSessions();
}
async function refreshSessions() {
  if (!state.project) return;
  state.sessions = await window.nexus.listSessions(state.project);
  renderSessions();
}

// ---------- Projekt-Kontext ----------
// Gemeinsames Wissen fuer alle KIs: Claude Code/Codex lesen es ueber CLAUDE.md/AGENTS.md,
// in Web-KIs kommt es per "Kontext kopieren" und Strg+V.
async function loadContext(pid) {
  const text = await window.nexus.contextGet(pid);
  const changed = (state.contexts[pid] || '') !== text;
  state.contexts[pid] = text;
  if (changed && pid === state.project) renderDesk();
}
function openContextEditor(p) {
  let text = state.contexts[p.id] || '';
  let error = '';
  let saved = null;
  const render = () => {
    const area = el('textarea', { class: 'm-context', rows: '16', placeholder: t('context.placeholder'), spellcheck: 'true' });
    area.value = text;
    area.oninput = () => { text = area.value; };
    const save = async () => {
      error = '';
      try {
        const r = await window.nexus.contextSet(p.id, text);
        state.contexts[p.id] = text;
        saved = r.written;
        renderDesk();
      } catch (e) { error = errText(e); }
      render();
    };
    modalBox().replaceChildren(...[
      el('div', { class: 'm-head' }, el('h2', {}, t('context.title', { name: p.name })), el('button', { onclick: closeModal }, t('common.close'))),
      el('p', { class: 'm-sub' }, t('context.intro')),
      area,
      el('p', { class: 'm-sub' }, t('context.where')),
      saved ? el('div', { class: 'm-note' }, saved.length ? t('context.saved', { files: saved.join(', ') }) : t('context.savedNoChange')) : null,
      error ? el('div', { class: 'm-error' }, error) : null,
      el('div', { class: 'm-foot' }, el('button', { class: 'primary', onclick: save }, t('common.save'))),
    ].filter(Boolean));
    setTimeout(() => modalBox().querySelector('.m-context')?.focus(), 0);
  };
  openModal(render);
}
// Fuer Web-KIs: Kontext in die Zwischenablage, dann dort mit Strg+V einfuegen
async function copyContext(pid) {
  const p = project(pid);
  const text = state.contexts[pid] || '';
  if (!p || !text.trim()) return;
  await window.nexus.copyText(t('context.copyHeader', { name: p.name }) + '\n\n' + text.trim());
  showToast(t('context.copied'));
}

// ---------- Sitzungsliste ----------
function renderSessions() {
  const chips = [el('span', { class: 'chip all' + (state.filterColor ? '' : ' on'), title: t('sessions.all'), onclick: () => { state.filterColor = null; renderSessions(); } })];
  for (const c of state.palette) chips.push(el('span', { class: 'chip' + (state.filterColor === c ? ' on' : ''), style: { background: c }, title: t('sessions.onlyColor'), onclick: () => { state.filterColor = state.filterColor === c ? null : c; renderSessions(); } }));
  $('#color-filter').replaceChildren(...chips);
  const q = state.search.toLowerCase();
  const inDesk = new Set(desk().workspaces.map((w) => w.sessionId).filter(Boolean));
  const titleOf = (s) => s.title || t('sessions.untitled');
  const list = state.sessions.filter((s) => (!state.filterColor || state.sessionMeta[s.id]?.color === state.filterColor) && (!q || titleOf(s).toLowerCase().includes(q)));
  const row = (s) => {
    const meta = state.sessionMeta[s.id] || {};
    const colorBtn = el('button', { title: t('sessions.color') }, '🎨');
    colorBtn.onclick = (e) => { e.stopPropagation(); swatchOverlay(colorBtn, state.palette, async (c) => { state.sessionMeta[s.id] = await window.nexus.updateSessionMeta(s.id, { color: c }); renderSessions(); }, true); };
    const pinBtn = el('button', { title: meta.pinned ? t('sessions.unpin') : t('sessions.pin') }, meta.pinned ? '📌' : '📍');
    pinBtn.onclick = async (e) => { e.stopPropagation(); state.sessionMeta[s.id] = await window.nexus.updateSessionMeta(s.id, { pinned: !meta.pinned }); renderSessions(); };
    return el('div', { class: 'session' + (inDesk.has(s.id) ? ' open' : ''), style: { '--sc': meta.color || 'transparent' }, title: t('sessions.loadInto', { title: titleOf(s) }), onclick: () => openSessionInDesk(s) },
      el('div', { class: 'title' }, (meta.pinned ? '📌 ' : '') + titleOf(s)),
      el('div', { class: 'meta' }, `${relTime(s.updated)} · ${tn('sessions.prompts', s.prompts)}`),
      el('div', { class: 'actions' }, colorBtn, pinBtn));
  };
  const pinned = list.filter((s) => state.sessionMeta[s.id]?.pinned);
  const rest = list.filter((s) => !state.sessionMeta[s.id]?.pinned);
  const out = [];
  if (pinned.length) out.push(el('div', { class: 'side-note' }, t('sessions.pinned')), ...pinned.map(row));
  out.push(...rest.map(row));
  if (!state.sessions.length) out.push(el('div', { class: 'side-note' }, t('sessions.none')));
  $('#session-list').replaceChildren(...out);
}
$('#search').addEventListener('input', (e) => { state.search = e.target.value; renderSessions(); });

function openSessionInDesk(s) {
  const d = desk();
  const existing = d.workspaces.find((w) => w.type === 'claude-code' && w.sessionId === s.id);
  if (existing) { placeInFocus(existing.id); return; }
  addWorkspace('claude-code', { sessionId: s.id, title: s.title || t('sessions.untitled') });
}
