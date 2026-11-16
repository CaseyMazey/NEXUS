// Start der Oberflaeche: Zustand und Sprache holen, dann alles zeichnen.
(async () => {
  try {
    await start();
  } finally {
    document.body.dataset.ready = '1';
  }
})();

async function start() {
  const st = await window.nexus.getState();
  STRINGS = st.strings || {};
  LANG = st.lang || 'de';
  delete st.strings;
  Object.assign(state, st);
  state.settings ||= {};
  applyI18n();
  renderProjects();
  renderAis();
  renderThemeBtn();
  window.nexus.aiStatus().then((s) => { state.aiStatus = s; renderAis(); });
  const first = project(state.lastProject) || state.projects[0];
  if (first) selectProject(first.id); else renderNoProject();
  // Hinweise zum Start: Daten vom Prototyp uebernommen / Sicherung geladen
  const notice = st.recovered ? t('notice.recovered', { file: st.recovered.backup || '-' }) : st.migrated ? t('notice.migrated', { dir: st.migrated.from }) : '';
  if (notice) showToast(notice);
}

function showToast(text, actions = [], sticky = false) {
  const n = el('div', { class: 'toast' }, el('span', {}, text), ...actions, el('button', { class: 'toast-x', onclick: () => n.remove() }, '×'));
  document.body.append(n);
  if (!sticky) setTimeout(() => n.remove(), 15000);
  return n;
}

// ---------- Claude Code installiert/angemeldet? ----------
function claudeText(c) {
  if (!c) return t('claude.checking');
  if (!c.installed) return t('claude.missing');
  if (c.loggedIn === false) return t('claude.loggedOut');
  return t('claude.ok', { version: c.version || '?' });
}
// Hinweis im 3C-Fenster bzw. Terminal, wenn Claude Code fehlt oder nicht angemeldet ist
function claudeProblem() {
  const c = state.claude;
  if (!c) return null;
  if (!c.installed) return 'missing';
  if (c.loggedIn === false) return 'loggedOut';
  return null;
}
window.nexus.onClaudeStatus((c) => {
  const before = claudeProblem();
  state.claude = c;
  if (modalOpen && modalRender) modalRender();
  if (state.project && before !== claudeProblem()) renderDesk();
});

// ---------- Updates ----------
function updateText(u) {
  if (!u) return '';
  if (u.status === 'downloading') return t('update.downloading', { version: u.version || '', percent: u.percent || 0 });
  if (u.status === 'error') return t('update.error');
  return t(`update.status.${u.status}`);
}
let updateToast = null;
window.nexus.onUpdateState((u) => {
  state.update = u;
  if (modalOpen && modalRender) modalRender();
  // fertig geladen: einmal Bescheid geben; "Spaeter" installiert beim Beenden
  if (u.status === 'ready' && !updateToast) {
    updateToast = showToast(t('update.ready', { version: u.version }), [
      el('button', { class: 'primary', onclick: () => window.nexus.updateInstall() }, t('update.restart')),
      el('button', { onclick: () => updateToast.remove() }, t('update.later')),
    ], true);
  }
});
