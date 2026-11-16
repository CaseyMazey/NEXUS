// Sprachen: Deutsch und Englisch. Texte stehen in locales/<sprache>.json (flache Schluessel, {name} als Platzhalter).
// Die Oberflaeche bekommt das passende Woerterbuch ueber get-state.
const fs = require('node:fs');
const path = require('node:path');

const LANGS = ['de', 'en'];
const DIR = path.join(__dirname, '..', '..', 'locales');
const cache = new Map();

function dict(lang) {
  if (!cache.has(lang)) cache.set(lang, JSON.parse(fs.readFileSync(path.join(DIR, `${lang}.json`), 'utf8')));
  return cache.get(lang);
}

// Einstellung 'auto' folgt der Windows-Sprache: Deutsch fuer de-*, sonst Englisch
function resolveLang(setting, systemLocale = '') {
  if (LANGS.includes(setting)) return setting;
  return /^de\b/i.test(systemLocale) ? 'de' : 'en';
}

function format(str, vars) {
  return vars ? str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : str;
}

// Uebersetzer fuer eine Sprache; fehlende Schluessel fallen auf Englisch, dann auf den Schluessel zurueck
function translator(lang) {
  const d = dict(lang);
  const en = dict('en');
  return (key, vars) => format(d[key] ?? en[key] ?? key, vars);
}

module.exports = { LANGS, dict, resolveLang, translator, format };
