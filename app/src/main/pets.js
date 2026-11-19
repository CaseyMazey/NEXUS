// Verbindung zu "Pets" (Bildschirm-Pets, eigene App): meldet fertige 3C-Auftraege und Rueckfragen.
// Pets lauscht nur auf 127.0.0.1. Laeuft Pets nicht, passiert einfach nichts (kein Fehler, keine Wartezeit).
const http = require('http');

const PORT = Number(process.env.PETS_PORT) || 47811;

function sendToPets(event) {
  if (process.env.NEXUS_FAKE_AGENT === '1') return;
  let body;
  try { body = JSON.stringify({ app: 'nexus', ...event }); } catch { return; }
  const req = http.request({
    host: '127.0.0.1', port: PORT, path: '/event', method: 'POST', timeout: 1500,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  });
  req.on('error', () => {});
  req.on('timeout', () => req.destroy());
  req.end(body);
}

// Ereignis aus Claude Code / Codex: Abschluss eines Auftrags
function petResult(project, data) {
  if (!data || data.type !== 'result') return;
  if (data.subtype === 'interrupted' || data.result === 'interrupt') return; // selbst gestoppt: kein "fertig"
  sendToPets({
    type: data.is_error ? 'task-error' : 'task-done',
    project: String(project?.name || '').slice(0, 80),
    seconds: Math.round((Number(data.duration_ms) || 0) / 1000),
  });
}

function petDecision(project, ev) {
  sendToPets({ type: 'decision', project: String(project?.name || '').slice(0, 80), tool: String(ev?.displayName || ev?.tool || '').slice(0, 60) });
}

module.exports = { petResult, petDecision, sendToPets };
