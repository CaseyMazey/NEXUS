// Neue NEXUS-Version veroeffentlichen:
//   npm run release -- 0.2.0 "Was ist neu (kurz, fuer Nutzer)"
// Setzt die Version in package.json, committet, legt den Tag v<version> mit den Notizen an und pusht.
// Den Rest erledigt GitHub Actions (.github/workflows/release.yml): Build auf Windows, macOS und Linux,
// danach das GitHub Release mit allen Dateien – daraus holen sich die installierten Apps das Update.
// Braucht: sauberes Arbeitsverzeichnis auf main.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const [version, notes] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version || '') || !notes) {
  console.error('Aufruf: npm run release -- <version> "<was ist neu>"   (z. B. 0.2.0)');
  process.exit(1);
}
// git ohne Shell aufrufen (sonst zerlegt Windows Texte mit Leerzeichen)
const run = (args) => execFileSync('git', args, { cwd: APP, stdio: 'inherit' });
const out = (args) => execFileSync('git', args, { cwd: APP, encoding: 'utf8' }).trim();

if (out(['status', '--porcelain'])) { console.error('Erst alles committen (git status ist nicht sauber).'); process.exit(1); }
if (out(['rev-parse', '--abbrev-ref', 'HEAD']) !== 'main') { console.error('Releases nur von main.'); process.exit(1); }
const pkgFile = path.join(APP, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const cmp = (a, b) => { const x = a.split('.').map(Number); const y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
if (cmp(version, pkg.version) <= 0) { console.error(`Neue Version muss groesser sein als ${pkg.version}.`); process.exit(1); }

pkg.version = version;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
run(['commit', '-am', `NEXUS ${version}`]);
run(['tag', '-a', `v${version}`, '-m', notes]);
run(['push']);
run(['push', 'origin', `v${version}`]);
console.log(`\nTag v${version} gepusht. GitHub baut jetzt fuer Windows, macOS und Linux und legt das Release an:`);
console.log('https://github.com/CaseyMazey/NEXUS/actions');
