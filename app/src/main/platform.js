// Unterschiede zwischen Windows, macOS und Linux an einer Stelle.
const { spawnSync, execFileSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

// Claude Code starten: unter Windows ueber cmd.exe (claude ist dort eine .cmd-Datei),
// sonst direkt (der Programmpfad wird beim Start mit fixPath() aus der Shell geholt).
function claudeCommand(args = [], platform = process.platform, env = process.env) {
  if (platform === 'win32') return { file: env.ComSpec || 'cmd.exe', args: ['/d', '/c', 'claude', ...args] };
  return { file: 'claude', args };
}

// Prozess samt Kindern beenden. Unter Windows per taskkill, sonst ueber die Prozessgruppe
// (dafuer werden Prozesse mit detached: true gestartet, siehe spawnOptions()).
function killTree(proc) {
  if (!proc || !proc.pid || proc.exitCode !== null) return;
  if (isWin) { spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }); return; }
  try { process.kill(-proc.pid, 'SIGTERM'); } catch { try { proc.kill('SIGTERM'); } catch { /* schon beendet */ } }
}
const spawnOptions = () => (isWin ? { windowsHide: true } : { detached: true });

// macOS/Linux: Per Doppelklick gestartete Apps kennen den Programmpfad der Shell nicht
// (z. B. ~/.local/bin, /opt/homebrew/bin). Ohne das findet NEXUS "claude" nicht.
function fixPath(env = process.env) {
  if (isWin) return env.PATH;
  const parts = new Set((env.PATH || '').split(':').filter(Boolean));
  try {
    const shell = env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash');
    const out = execFileSync(shell, ['-ilc', 'printf "__NEXUS_PATH__%s" "$PATH"'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = /__NEXUS_PATH__(.*)$/s.exec(out);
    if (m) for (const p of m[1].trim().split(':')) if (p) parts.add(p);
  } catch { /* Shell nicht lesbar: uebliche Orte unten reichen meist */ }
  const home = os.homedir();
  for (const p of [path.join(home, '.local', 'bin'), path.join(home, '.claude', 'local'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']) parts.add(p);
  env.PATH = [...parts].join(':');
  return env.PATH;
}

// Taste fuer Tastenkuerzel in Texten
const modKey = () => (isMac ? '⌘' : 'Strg');

module.exports = { isWin, isMac, claudeCommand, killTree, spawnOptions, fixPath, modKey };
