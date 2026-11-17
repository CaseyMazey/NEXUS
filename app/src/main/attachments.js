// Dateianhaenge fuer 3C (alles ausser Bildern, die gehen direkt an Claude):
// NEXUS legt eine Kopie in %APPDATA%\NEXUS\attachments\JJJJ-MM-TT\ ab und schreibt den Pfad in die Nachricht.
// Claude Code bekommt Zugriff auf diesen Ordner (--add-dir). Das Original bleibt unangetastet.
// Kopien aelter als 30 Tage werden entfernt (nur in diesem Ordner).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_SIZE = 100 * 1024 * 1024; // 100 MB pro Datei
const KEEP_DAYS = 30;

// Dateiname ohne Pfadanteile und ohne unter Windows verbotene Zeichen
function safeName(name) {
  // eslint-disable-next-line no-control-regex
  let n = String(name || 'datei').split(/[\\/]/).pop().replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim();
  if (!n || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(n)) n = 'datei' + (n ? '_' + n : '');
  return n.slice(0, 120);
}

function saveAttachment(root, name, data, now = new Date()) {
  const buf = Buffer.from(data);
  if (!buf.length) throw new Error('empty');
  if (buf.length > MAX_SIZE) throw new Error('too-big');
  const dir = path.join(root, now.toISOString().slice(0, 10), crypto.randomBytes(3).toString('hex'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, safeName(name));
  fs.writeFileSync(file, buf);
  return { path: file, name: path.basename(file), size: buf.length };
}

// Alte Tagesordner entfernen (nur Ordner nach dem Muster JJJJ-MM-TT)
function pruneAttachments(root, now = Date.now()) {
  if (!fs.existsSync(root)) return;
  for (const d of fs.readdirSync(root)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && now - Date.parse(d) > KEEP_DAYS * 86400000) fs.rmSync(path.join(root, d), { recursive: true, force: true });
  }
}

module.exports = { saveAttachment, pruneAttachments, safeName, MAX_SIZE, KEEP_DAYS };
