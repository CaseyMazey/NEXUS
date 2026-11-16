// Einstellungen und Themes (ohne Electron, damit testbar).
const path = require('node:path');
const { MODEL } = require('./validate');

// mode bestimmt, was den KI-Seiten als prefers-color-scheme gemeldet wird; bg ist die Fensterfarbe beim Start.
// Die Farben selbst stehen in app.css (:root[data-theme=…]).
const THEMES = {
  hell: { mode: 'light', bg: '#f5f6f8' }, creme: { mode: 'light', bg: '#f7f3ea' }, sand: { mode: 'light', bg: '#ece4d4' },
  nacht: { mode: 'dark', bg: '#111216' }, retro: { mode: 'dark', bg: '#050805' }, kupfer: { mode: 'dark', bg: '#1a1714' },
};

const VALIDATORS = {
  confirmRemove: (v) => typeof v === 'boolean',
  theme: (v) => Object.hasOwn(THEMES, v),
  // zwischen diesen beiden wechselt der Sonne/Mond-Knopf
  lightTheme: (v) => THEMES[v]?.mode === 'light',
  darkTheme: (v) => THEMES[v]?.mode === 'dark',
  chatMode: (v) => ['default', 'acceptEdits', 'auto', 'pushOnly', 'bypassPermissions', 'plan'].includes(v),
  chatModel: (v) => typeof v === 'string' && MODEL.test(v),
  notify: (v) => typeof v === 'boolean',
  language: (v) => ['auto', 'de', 'en'].includes(v),
  projectRoot: (v) => typeof v === 'string' && path.isAbsolute(v) && v.length < 500,
};

const DEFAULTS = { theme: 'nacht', lightTheme: 'hell', darkTheme: 'nacht', language: 'auto', notify: true, confirmRemove: true };

// Ungueltige oder fehlende Werte durch Standardwerte ersetzen, unbekannte Schluessel entfernen
function normalize(settings) {
  const out = {};
  for (const [k, ok] of Object.entries(VALIDATORS)) {
    const v = settings?.[k];
    if (v !== undefined && ok(v)) out[k] = v;
    else if (k in DEFAULTS) out[k] = DEFAULTS[k];
  }
  return out;
}

module.exports = { THEMES, VALIDATORS, DEFAULTS, normalize };
