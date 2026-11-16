// Ist Claude Code installiert und angemeldet? (fuer 3C und das Terminal)
// Nutzt "claude auth status" und "claude --version". Uebernommen wird nur ja/nein und die Version –
// nie E-Mail, Organisation oder sonstige Kontodaten.
const { execFile } = require('node:child_process');

function run(args, env, timeout) {
  return new Promise((resolve) => {
    execFile(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'claude', ...args], { env, timeout, windowsHide: true },
      (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}

// Ergebnis: { installed, loggedIn, version } – loggedIn null, wenn unklar
function parseStatus(r) {
  const notFound = /is not recognized|nicht als interner oder externer Befehl|not found|ENOENT/i.test(r.stderr + (r.err?.message || ''));
  if (notFound) return { installed: false, loggedIn: false };
  try {
    const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
    return { installed: true, loggedIn: j.loggedIn === true };
  } catch {
    return { installed: !r.err || r.err.code !== 9009, loggedIn: null };
  }
}

async function checkClaude(env, timeout = 20000) {
  const status = parseStatus(await run(['auth', 'status'], env, timeout));
  if (status.installed) {
    const v = await run(['--version'], env, timeout);
    const m = /(\d+\.\d+\.\d+)/.exec(v.stdout);
    if (m) status.version = m[1];
  }
  return status;
}

module.exports = { checkClaude, parseStatus };
