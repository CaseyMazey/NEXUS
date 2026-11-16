// Themes und Einstellungen.
// NEXUS-Oberflaeche, 3C und Terminals ueber CSS-Variablen (app.css) bzw. xterm-Theme.
// Web-KIs: Electron meldet den Seiten nur hell/dunkel (prefers-color-scheme). Kein Eingriff in die Seiten.
const THEMES = [
  { id: 'hell', mode: 'light', sw: ['#ffffff', '#eef0f4', '#1d2027'] },
  { id: 'creme', mode: 'light', sw: ['#fffcf5', '#f1ece0', '#2b2720'] },
  { id: 'sand', mode: 'light', sw: ['#f5efe3', '#e5dccb', '#2e2819'] },
  { id: 'nacht', mode: 'dark', sw: ['#17181d', '#1d1f26', '#e7e8ec'] },
  { id: 'retro', mode: 'dark', sw: ['#0a100a', '#0f180f', '#33ff66'] },
  { id: 'kupfer', mode: 'dark', sw: ['#211d19', '#2a251f', '#e8915c'] },
];
const themeName = (th) => t(`theme.${th.id}`);
const themeHint = (th) => t(`theme.${th.id}.hint`);
const curTheme = () => THEMES.find((th) => th.id === state.settings?.theme) || THEMES[3];
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
  const th = curTheme();
  document.documentElement.dataset.theme = th.id;
  for (const l of live.values()) if (l.term && l.termProject) l.term.options.theme = termTheme(l.termProject);
  const b = $('#theme');
  b.textContent = th.mode === 'light' ? '☀️' : '🌙';
  b.title = t('theme.button', { name: themeName(th) });
}
async function setTheme(id) {
  state.settings = await window.nexus.setSetting('theme', id);
  renderThemeBtn();
}
// Sonne/Mond: wechselt zwischen dem gewaehlten hellen und dunklen Theme
$('#theme').onclick = () => setTheme(isLight() ? state.settings.darkTheme || 'nacht' : state.settings.lightTheme || 'hell');

const setSetting = async (key, value) => { state.settings = await window.nexus.setSetting(key, value); };
const checkbox = (key, label) => el('label', { class: 'm-check' },
  el('input', { type: 'checkbox', ...(state.settings[key] !== false ? { checked: '' } : {}), onchange: (e) => setSetting(key, e.target.checked) }), label);

function openSettings() {
  const startLang = state.settings.language || 'auto';
  const render = () => {
    const pick = (mode) => {
      const key = mode === 'light' ? 'lightTheme' : 'darkTheme';
      return el('div', { class: 'theme-grid' }, ...THEMES.filter((th) => th.mode === mode).map((th) => el('button', {
        class: 'theme-card' + (state.settings[key] === th.id ? ' on' : ''), title: themeHint(th),
        onclick: async () => {
          await setSetting(key, th.id);
          if (curTheme().mode === mode) await setTheme(th.id);
          render();
        } },
        el('span', { class: 'theme-sw' }, ...th.sw.map((c) => el('i', { style: { background: c } }))),
        el('span', { class: 'theme-name' }, themeName(th)), el('span', { class: 'theme-hint' }, themeHint(th)))));
    };
    const langSel = el('select', { class: 'm-select', onchange: async (e) => { await setSetting('language', e.target.value); render(); } },
      ...[['auto', t('settings.langAuto')], ['de', 'Deutsch'], ['en', 'English']].map(([v, label]) =>
        el('option', { value: v, ...((state.settings.language || 'auto') === v ? { selected: '' } : {}) }, label)));
    const langChanged = (state.settings.language || 'auto') !== startLang;
    const pickRoot = async () => {
      const dir = await window.nexus.pickFolder(state.projectRoot);
      if (!dir) return;
      await setSetting('projectRoot', dir);
      state.projectRoot = dir;
      render();
    };
    modalBox().replaceChildren(...[
      el('div', { class: 'm-head' }, el('h2', {}, t('settings.title')), el('button', { onclick: closeModal }, t('common.done'))),
      el('h3', {}, t('settings.language')),
      langSel,
      langChanged ? el('div', { class: 'm-note' }, t('settings.langRestart'), el('button', { class: 'primary', onclick: () => window.nexus.relaunch() }, t('settings.restartNow'))) : null,
      el('h3', {}, t('settings.theme')),
      el('p', { class: 'm-sub' }, t('settings.themeHint')),
      el('div', { class: 'theme-label' }, '☀️ ' + t('settings.lightTheme')), pick('light'),
      el('div', { class: 'theme-label' }, '🌙 ' + t('settings.darkTheme')), pick('dark'),
      el('p', { class: 'm-sub' }, t('settings.webThemeHint')),
      el('h3', {}, t('settings.projectRoot')),
      el('p', { class: 'm-sub' }, t('settings.projectRootHint')),
      el('div', { class: 'p-folder' }, el('code', {}, state.projectRoot), el('button', { onclick: pickRoot }, t('common.change'))),
      el('h3', {}, t('settings.notifications')),
      checkbox('notify', t('settings.notify')),
      el('h3', {}, t('settings.workspaces')),
      checkbox('confirmRemove', t('settings.confirmRemove')),
    ].filter(Boolean));
  };
  openModal(render);
}
$('#settings').onclick = () => openSettings();
