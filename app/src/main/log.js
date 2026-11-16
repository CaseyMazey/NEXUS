// Protokolldatei: %APPDATA%\NEXUS\logs\nexus-JJJJ-MM-TT.log, die letzten 14 Tage bleiben.
// Alles, was der Hauptprozess mit console.log/warn/error ausgibt, landet zusaetzlich in der Datei.
// Keine Zugangsdaten, keine E-Mail-Adressen, keine vollstaendigen URLs mit Query (siehe webviews.js).
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');

const KEEP_DAYS = 14;
let dir = null;
let stream = null;
let day = '';

const today = () => new Date().toISOString().slice(0, 10);
// E-Mail-Adressen sicherheitshalber unkenntlich machen
const scrub = (s) => s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>');

function open() {
  day = today();
  if (stream) stream.end();
  stream = fs.createWriteStream(path.join(dir, `nexus-${day}.log`), { flags: 'a' });
}

function write(level, args) {
  if (!dir) return;
  if (today() !== day) open();
  const line = `${new Date().toISOString()} ${level} ${scrub(util.format(...args))}\n`;
  stream.write(line);
}

// Alte Protokolle entfernen (nur eigene Dateien nach dem Muster nexus-*.log)
function prune(now = Date.now()) {
  for (const f of fs.readdirSync(dir)) {
    const m = /^nexus-(\d{4}-\d{2}-\d{2})\.log$/.exec(f);
    if (m && now - Date.parse(m[1]) > KEEP_DAYS * 86400000) fs.rmSync(path.join(dir, f), { force: true });
  }
}

function initLog(dataDir) {
  dir = path.join(dataDir, 'logs');
  fs.mkdirSync(dir, { recursive: true });
  prune();
  open();
  for (const [name, level] of [['log', 'INFO'], ['warn', 'WARN'], ['error', 'ERROR']]) {
    const orig = console[name].bind(console);
    console[name] = (...args) => { write(level, args); orig(...args); };
  }
  process.on('uncaughtException', (e) => console.error('[uncaught]', e && e.stack || e));
  process.on('unhandledRejection', (e) => console.error('[unhandled]', e && e.stack || e));
  return dir;
}

const logDir = () => dir;

module.exports = { initLog, logDir, prune, scrub, KEEP_DAYS };
