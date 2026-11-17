// Projekt-Kontext: gemeinsames Wissen fuer alle KIs eines Projekts.
// Gespeichert in <projekt>/.nexus/context.md. NEXUS spiegelt ihn in CLAUDE.md (Claude Code) und
// AGENTS.md (Codex u. a.) – aber nur in einen markierten Abschnitt. Alles andere in diesen Dateien
// bleibt unangetastet. NEXUS loescht keine Dateien: ein leerer Kontext entfernt nur den Abschnitt.
const fs = require('node:fs');
const path = require('node:path');

const START = '<!-- NEXUS:kontext:start – wird von NEXUS gepflegt, bitte in NEXUS bearbeiten -->';
const END = '<!-- NEXUS:kontext:ende -->';
const MIRRORS = ['CLAUDE.md', 'AGENTS.md'];
const MAX = 200000;

const contextFile = (dir) => path.join(dir, '.nexus', 'context.md');

function readContext(dir) {
  try { return fs.readFileSync(contextFile(dir), 'utf8'); } catch { return ''; }
}

// Abschnitt in einen vorhandenen Dateiinhalt einsetzen, ersetzen oder entfernen (ohne Dateizugriff, testbar)
function applyBlock(existing, text) {
  const body = String(text || '').trim();
  const block = body ? `${START}\n## Projektkontext (aus NEXUS)\n\n${body}\n${END}` : '';
  const old = existing || '';
  const s = old.indexOf(START);
  const e = old.indexOf(END);
  if (s >= 0 && e > s) {
    const before = old.slice(0, s).replace(/\s+$/, '');
    const after = old.slice(e + END.length).replace(/^\s+/, '');
    return [before, block, after].filter(Boolean).join('\n\n') + (before || block || after ? '\n' : '');
  }
  if (!block) return old;
  return old.trim() ? `${old.replace(/\s+$/, '')}\n\n${block}\n` : `${block}\n`;
}

// Kontext speichern und spiegeln. Rueckgabe: welche Dateien geschrieben wurden.
function writeContext(dir, text) {
  const body = String(text || '').slice(0, MAX);
  fs.mkdirSync(path.dirname(contextFile(dir)), { recursive: true });
  fs.writeFileSync(contextFile(dir), body);
  const written = [];
  for (const name of MIRRORS) {
    const file = path.join(dir, name);
    const exists = fs.existsSync(file);
    if (!exists && !body.trim()) continue; // leerer Kontext legt keine neuen Dateien an
    const before = exists ? fs.readFileSync(file, 'utf8') : '';
    const after = applyBlock(before, body);
    if (after !== before) { fs.writeFileSync(file, after); written.push(name); }
  }
  return written;
}

module.exports = { readContext, writeContext, applyBlock, contextFile, START, END, MIRRORS, MAX };
