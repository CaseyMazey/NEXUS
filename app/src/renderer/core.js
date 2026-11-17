// NEXUS Oberflaeche – Grundlagen: Sprache, Hilfsfunktionen, Zustand, Overlays und Dialoge.
// Die Oberflaechen-Skripte sind klassische Skripte und teilen sich den globalen Namensraum
// (Reihenfolge in index.html: core → theme → projects → desk → ais → main).

// ---------- Sprache ----------
let STRINGS = {};
let LANG = 'de';
let PLATFORM = 'win32';
// Taste fuer Tastenkuerzel: ⌘ auf dem Mac, sonst Strg (deutsch) bzw. Ctrl (englisch)
const modKey = () => (PLATFORM === 'darwin' ? '⌘' : LANG === 'de' ? 'Strg' : 'Ctrl');
function t(key, vars) {
  const s = STRINGS[key] ?? key;
  const all = { mod: modKey(), ...vars };
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in all ? String(all[k]) : m));
}
// Mehrzahl: Schluessel.one / Schluessel.other
const tn = (key, n, vars = {}) => t(`${key}.${n === 1 ? 'one' : 'other'}`, { n, ...vars });
// Texte in index.html: data-i18n, data-i18n-title, data-i18n-placeholder
function applyI18n(root = document) {
  document.documentElement.lang = LANG;
  for (const e of root.querySelectorAll('[data-i18n]')) e.textContent = t(e.dataset.i18n);
  for (const e of root.querySelectorAll('[data-i18n-title]')) e.title = t(e.dataset.i18nTitle);
  for (const e of root.querySelectorAll('[data-i18n-placeholder]')) e.placeholder = t(e.dataset.i18nPlaceholder);
}
const locale = () => (LANG === 'de' ? 'de-DE' : 'en-GB');
function relTime(ms) {
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return t('time.justNow');
  if (d < 3600) return t('time.minutesAgo', { n: Math.floor(d / 60) });
  if (d < 86400) return t('time.hoursAgo', { n: Math.floor(d / 3600) });
  if (d < 86400 * 7) return t('time.daysAgo', { n: Math.floor(d / 86400) });
  return new Date(ms).toLocaleDateString(locale());
}
// Fehlermeldung aus dem Hauptprozess ohne Electron-Vorsatz
const errText = (e) => String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// ---------- Hilfsfunktionen ----------
const $ = (s) => document.querySelector(s);
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

// ---------- Zustand ----------
const state = {
  projects: [], sessionMeta: {}, desks: {}, slashCommands: [], palette: [], icons: [],
  project: null, sessions: [], filterColor: null, search: '', usage: null,
  ais: [], catalog: [], aiStatus: {}, settings: {},
  contexts: {}, // projectId -> Projektkontext (Text)
};
const live = new Map(); // wsId -> { type, projectId, body, view?, term?, fit?, termId?, busy, waiting, webState }
const project = (id = state.project) => state.projects.find((p) => p.id === id);

// Workspace-Typ -> Anzeige. Web-KIs kommen aus "Meine KIs".
const CODE_INFO = {
  'claude-code': { labelKey: 'ws.claudeCode', icon: '✳️', color: '#d97757', kind: 'chat' },
  'claude-code-term': { labelKey: 'ws.claudeCodeTerm', icon: '⌨', color: '#d97757', kind: 'term' },
};
function wsInfo(type) {
  if (CODE_INFO[type]) return { ...CODE_INFO[type], label: t(CODE_INFO[type].labelKey) };
  const ai = state.ais.find((a) => a.id === type);
  return ai ? { ...ai, kind: 'web' } : { label: t('ws.removedAi'), removed: true, icon: '❔', color: '#555', kind: 'web' };
}
// Was man in einen Desk legen kann: Claude Code + alle aufgenommenen KIs
const addableTypes = () => [...Object.keys(CODE_INFO), ...state.ais.map((a) => a.id)].map((type) => [type, wsInfo(type)]);

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
    class: 'opt', title: o.none ? t('common.none') : o.c, style: { background: o.c },
    onclick: (e) => { e.stopPropagation(); closeOverlay(); onPick(o.none ? null : o.c); },
  })))]);
}

// ---------- Dialoge ----------
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
const modalBox = () => document.querySelector('#modal .modal-box');
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalOpen) closeModal(); });
// Ja/Nein-Dialog in NEXUS-Optik (statt window.confirm)
function confirmDialog({ title, text, yes, danger }, onYes) {
  openModal(() => {
    modalBox().replaceChildren(
      el('h2', {}, title),
      ...String(text).split('\n').map((line) => el('p', { class: 'm-sub' }, line)),
      el('div', { class: 'm-foot' },
        el('button', { onclick: closeModal }, t('common.cancel')),
        el('button', { class: danger ? 'danger-fill' : 'primary', onclick: async () => { closeModal(); await onYes(); } }, yes)));
  });
}
