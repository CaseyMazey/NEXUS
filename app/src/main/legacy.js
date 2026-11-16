// Einmaliger Daten-Umzug vom Prototyp (%APPDATA%\nexus-terminal-test) nach %APPDATA%\NEXUS.
// Kopiert alles ausser Caches, inklusive der Anmeldungen der KIs (Partitions + "Local State",
// darin liegt der Schluessel, mit dem Chromium die Cookies verschluesselt).
// Der alte Ordner bleibt unangetastet.
const fs = require('node:fs');
const path = require('node:path');
const { FILE } = require('./store');

// Caches und Sperrdateien: werden neu angelegt, muessen nicht mit
const SKIP = /^(Cache|Code Cache|GPUCache|GPUPersistentCache|GrShaderCache|ShaderCache|DawnGraphiteCache|DawnWebGPUCache|DawnCache|Crashpad|lockfile|SingletonLock|SingletonCookie|SingletonSocket|backups)$/;

function needsMigration(oldDir, newDir) {
  return fs.existsSync(path.join(oldDir, FILE)) && !fs.existsSync(path.join(newDir, FILE));
}

// Laeuft der Prototyp noch? Chromium haelt "lockfile" im Datenordner offen, solange die App laeuft.
function isLocked(dir) {
  const lock = path.join(dir, 'lockfile');
  if (!fs.existsSync(lock)) return false;
  try {
    fs.closeSync(fs.openSync(lock, 'r+'));
    return false;
  } catch (e) {
    return e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES';
  }
}

// Kopiert oldDir nach newDir. Die Datendatei kommt zuletzt: Bricht der Umzug ab,
// fehlt sie im Ziel, und beim naechsten Start wird erneut kopiert.
function migrateLegacy(oldDir, newDir) {
  fs.mkdirSync(newDir, { recursive: true });
  let files = 0;
  for (const name of fs.readdirSync(oldDir)) {
    if (SKIP.test(name) || name === FILE) continue;
    fs.cpSync(path.join(oldDir, name), path.join(newDir, name), {
      recursive: true, force: true, errorOnExist: false,
      filter: (src) => {
        const ok = !SKIP.test(path.basename(src));
        if (ok && fs.statSync(src).isFile()) files++;
        return ok;
      },
    });
  }
  fs.copyFileSync(path.join(oldDir, FILE), path.join(newDir, FILE));
  fs.writeFileSync(path.join(newDir, 'migrated-from.txt'), `${oldDir}\n${new Date().toISOString()}\n`);
  return files + 1;
}

module.exports = { needsMigration, isLocked, migrateLegacy, SKIP };
