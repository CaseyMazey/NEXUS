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

function showToast(text) {
  const n = el('div', { class: 'toast' }, el('span', {}, text), el('button', { onclick: () => n.remove() }, '×'));
  document.body.append(n);
  setTimeout(() => n.remove(), 15000);
}
