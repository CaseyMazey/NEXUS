// Neue NEXUS-Version veroeffentlichen:
//   npm run release -- 0.1.2 "Was ist neu (kurz, fuer Nutzer)"
// 1. Version in package.json setzen  2. Setup bauen (dist/)  3. GitHub Release v<version> anlegen
//    mit Setup, .blockmap und latest.yml – daraus holt sich die installierte App das Update.
// Braucht: gh (angemeldet), sauberes Arbeitsverzeichnis. Committet und pusht die Versionsaenderung.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const [version, notes] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version || '') || !notes) {
  console.error('Aufruf: npm run release -- <version> "<was ist neu>"   (z. B. 0.1.2)');
  process.exit(1);
}
// git und gh ohne Shell aufrufen (sonst zerlegt Windows Texte mit Leerzeichen); nur npx braucht die Shell
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: APP, stdio: 'inherit', ...opts });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: APP, encoding: 'utf8' }).trim();

if (out('git', ['status', '--porcelain'])) { console.error('Erst alles committen (git status ist nicht sauber).'); process.exit(1); }
const pkgFile = path.join(APP, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const cmp = (a, b) => { const x = a.split('.').map(Number); const y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
if (cmp(version, pkg.version) <= 0) { console.error(`Neue Version muss groesser sein als ${pkg.version}.`); process.exit(1); }

pkg.version = version;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
fs.rmSync(path.join(APP, 'dist'), { recursive: true, force: true });
run('npx', ['electron-builder', '--win', 'nsis', '--publish', 'never'], { shell: process.platform === 'win32' });

const setup = `dist/NEXUS-Setup-${version}.exe`;
for (const f of [setup, `${setup}.blockmap`, 'dist/latest.yml']) if (!fs.existsSync(path.join(APP, f))) { console.error('Fehlt:', f); process.exit(1); }

// Fester Name fuer den Download-Link in der README (…/releases/latest/download/NEXUS-Setup.exe)
fs.copyFileSync(path.join(APP, setup), path.join(APP, 'dist/NEXUS-Setup.exe'));

run('git', ['commit', '-am', `NEXUS ${version}`]);
run('git', ['push']);
const branch = out('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
run('gh', ['release', 'create', `v${version}`, setup, `${setup}.blockmap`, 'dist/latest.yml', 'dist/NEXUS-Setup.exe',
  '--title', `NEXUS ${version}`, '--notes', notes, '--target', branch]);
console.log(`\nNEXUS ${version} veroeffentlicht. Installierte Apps finden das Update beim naechsten Start (spaetestens nach 6 Stunden).`);
