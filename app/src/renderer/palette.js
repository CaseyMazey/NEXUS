// Tastenkuerzel und Schnellsuche (mod+K). Die Tasten erkennt der Hauptprozess (shortcuts.js),
// damit sie auch funktionieren, wenn gerade eine KI-Webseite den Fokus hat.

// Projekte in der Reihenfolge der Seitenleiste (mit Gruppen)
const projectOrder = () => (typeof sidebarOrder === 'function' ? sidebarOrder() : state.projects);

function focusedWs() {
  if (!project()) return null;
  const d = desk();
  return d.cells[d.focus] ? wsById(d.cells[d.focus]) : null;
}

function runShortcut(name) {
  if (modalOpen && name !== 'palette') return;
  const [cmd, arg] = name.split(':');
  if (cmd === 'project') { const p = projectOrder()[Number(arg) - 1]; if (p) selectProject(p.id); return; }
  if (cmd === 'palette') { if (modalOpen) closeModal(); else openPalette(); return; }
  if (cmd === 'settings') { openSettings(); return; }
  if (!project()) return;
  const d = desk();
  if (cmd === 'layout') { setLayout(Number(arg)); return; }
  if (cmd === 'new-chat') { addWorkspace('claude-code'); return; }
  if (cmd === 'new-codex') { if (typeof CODE_INFO['codex'] === 'object') addWorkspace('codex'); return; }
  if (cmd === 'close-ws') { const ws = focusedWs(); if (ws) removeWorkspace(ws.id); return; }
  if (cmd === 'ws' && d.workspaces.length) {
    const cur = d.workspaces.findIndex((w) => w.id === d.cells[d.focus]);
    const step = arg === 'prev' ? -1 : 1;
    const next = d.workspaces[(cur + step + d.workspaces.length) % d.workspaces.length];
    placeInFocus(next.id);
  }
}
window.nexus.onShortcut(runShortcut);

// ---------- Schnellsuche ----------
function paletteItems() {
  const items = [];
  projectOrder().forEach((p, i) => items.push({ icon: p.icon, label: p.name, hint: i < 9 ? `${modKey()}+${i + 1}` : t('palette.project'), run: () => selectProject(p.id) }));
  if (project()) {
    for (const w of desk().workspaces) {
      const info = wsInfo(w.type);
      items.push({ icon: info.icon, label: w.title, hint: t('palette.workspace'), run: () => placeInFocus(w.id) });
    }
    for (const s of state.sessions.slice(0, 30)) {
      items.push({ icon: '✳️', label: s.title || t('sessions.untitled'), hint: t('palette.session'), run: () => openSessionInDesk(s) });
    }
    for (const [type, info] of addableTypes()) {
      items.push({ icon: '＋', label: t('palette.open', { name: info.label }), hint: t('palette.action'), run: () => addWorkspace(type) });
    }
    items.push({ icon: '📋', label: t('context.button'), hint: t('palette.action'), run: () => openContextEditor(project()) });
  }
  items.push({ icon: '🗂️', label: t('project.newTitle'), hint: t('palette.action'), run: () => openProjectEditor(null) });
  items.push({ icon: '🤖', label: t('ai.title'), hint: t('palette.action'), run: () => openAiManager() });
  items.push({ icon: '⚙', label: t('settings.title'), hint: `${modKey()}+,`, run: () => openSettings() });
  return items;
}

function openPalette() {
  const all = paletteItems();
  let q = '';
  let sel = 0;
  const list = el('div', { class: 'pal-list' });
  const input = el('input', { class: 'pal-input', type: 'text', placeholder: t('palette.placeholder') });
  const matches = () => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((it) => words.every((w) => `${it.label} ${it.hint}`.toLowerCase().includes(w))).slice(0, 40);
  };
  const pick = (it) => { closeModal(); setTimeout(() => it.run(), 0); };
  const draw = () => {
    const m = matches();
    sel = Math.min(sel, Math.max(0, m.length - 1));
    list.replaceChildren(...(m.length ? m.map((it, i) => el('div', { class: 'pal-item' + (i === sel ? ' on' : ''), onmousedown: (e) => { e.preventDefault(); pick(it); } },
      el('span', { class: 'pal-icon' }, it.icon), el('span', { class: 'pal-label' }, it.label), el('span', { class: 'pal-hint' }, it.hint)))
      : [el('div', { class: 'side-note' }, t('palette.none'))]));
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', () => { q = input.value; sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    const m = matches();
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, m.length); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + m.length) % Math.max(1, m.length); draw(); }
    else if (e.key === 'Enter' && m[sel]) { e.preventDefault(); pick(m[sel]); }
  });
  openModal(() => {
    modalBox().classList.add('palette');
    modalBox().replaceChildren(input, list);
    draw();
    setTimeout(() => input.focus(), 0);
  });
}

// Liste fuer die Einstellungen
function shortcutList() {
  const m = modKey();
  return [
    [`${m}+K`, t('shortcut.palette')], [`${m}+1 … 9`, t('shortcut.project')], [`${m}+⇧+1 … 4`, t('shortcut.layout')],
    [`${PLATFORM === 'darwin' ? '⌃' : m}+Tab`, t('shortcut.nextWs')], [`${m}+N`, t('shortcut.newChat')], [`${m}+⇧+N`, t('shortcut.newCodex')],
    [`${m}+W`, t('shortcut.closeWs')], [`${m}+,`, t('settings.title')],
  ];
}
