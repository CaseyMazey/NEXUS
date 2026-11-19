// Steuert das installierte Claude Code im Headless-Modus (stream-json) fuer die NEXUS-Chat-Ansicht.
// NEXUS fasst keine Zugangsdaten an: Claude Code nutzt seine eigene Anmeldung.
const { spawn } = require('node:child_process');
const { claudeCommand, killTree, spawnOptions } = require('./platform');
const crypto = require('node:crypto');

// default = manuell (fragt), auto = Claude Code entscheidet selbst und fragt nur bei Riskantem, plan = nur planen
// bypassPermissions = "Nie fragen": alles ohne Rueckfrage. Dafuer startet Claude Code mit --allow-dangerously-skip-permissions
// (schaltet nur die Moeglichkeit frei; aktiv wird es erst, wenn der Modus gewaehlt ist).
const MODES = new Set(['default', 'acceptEdits', 'auto', 'pushOnly', 'bypassPermissions', 'plan']);

// pushOnly = "Fragt nur bei Push" (NEXUS-eigener Modus, kleine Schwester von "Nie fragen"):
// Claude Code laeuft mit acceptEdits; jede Rueckfrage beantwortet NEXUS sofort mit "erlauben",
// ausser der Befehl pusht (git push). Nur dann erscheint die Erlauben-Karte.
const PUSH = /(^|[\s;&|(`"'])git(\s+(-C|-c)\s+\S+|\s+--?[\w-]+(=\S+)?)*\s+push\b/i;
function isPush(req) {
  const cmd = req && req.input && typeof req.input.command === 'string' ? req.input.command : '';
  return PUSH.test(cmd);
}
const cliMode = (mode) => (mode === 'pushOnly' ? 'acceptEdits' : MODES.has(mode) ? mode : 'default');

// So lange darf Claude Code nach "Stoppen" brauchen, bevor NEXUS den Prozess beendet und die Sitzung neu startet
// (haengt Claude Code, z. B. bei Verbindungsproblemen, beantwortet es den Stopp nie und zaehlt endlos Sekunden).
const FORCE_STOP_MS = 5000;

class ChatSession {
  constructor({ cwd, resumeId, resumeAt, fork, mode, model, env, onEvent, denyMessage, addDirs = [] }) {
    this.onEvent = onEvent;
    this.denyMessage = denyMessage || 'Denied by the user in NEXUS.';
    this.pending = new Map(); // request_id -> request (Rueckfragen)
    this.ownRequests = new Map(); // request_id -> callback(response) fuer eigene Steuer-Anfragen
    this.pushOnly = mode === 'pushOnly';
    Object.assign(this, { cwd, env, addDirs, mode, model: model && /^[a-z0-9.-]+$/i.test(model) ? model : null });
    this.sessionId = resumeId && !fork ? resumeId : null;
    this.turnOpen = false; // laeuft gerade ein Auftrag (Nachricht gesendet, noch kein result)?
    this.stopTimer = null;
    this._spawn({ resumeId, resumeAt, fork });
  }

  _spawn({ resumeId, resumeAt, fork }) {
    const args = ['-p',
      '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--include-partial-messages',
      '--permission-mode', cliMode(this.mode),
      '--permission-prompts', 'host', '--permission-prompt-tool', 'stdio', '--allow-dangerously-skip-permissions',
      // nach jedem Auftrag ein Vorschlag fuer die naechste Nachricht (Tab uebernimmt ihn)
      '--prompt-suggestions', 'true'];
    if (resumeId) args.push('--resume', resumeId);
    // Abzweigen: neue Sitzung, die nur den Verlauf bis resumeAt (uuid einer Nachricht) kennt
    if (resumeId && resumeAt) args.push('--resume-session-at', resumeAt);
    if (resumeId && fork) args.push('--fork-session');
    // zusaetzliche Ordner, die Claude lesen darf (z. B. die Kopien angehaengter Dateien)
    for (const d of this.addDirs) args.push('--add-dir', d);
    if (this.model) args.push('--model', this.model);
    const cmd = claudeCommand(args, process.platform, this.env);
    const proc = spawn(cmd.file, cmd.args, { cwd: this.cwd, env: this.env, ...spawnOptions() });
    this.proc = proc;
    this.buf = '';
    // Ereignisse eines abgeloesten (haengenden) Prozesses ignorieren
    const mine = () => proc === this.proc;
    proc.stdout.on('data', (c) => { if (mine()) this._onData(c); });
    proc.stderr.on('data', (c) => { if (mine()) this.onEvent({ type: 'nexus-stderr', text: c.toString('utf8').slice(0, 2000) }); });
    proc.on('exit', (code) => { if (mine()) { this._clearStop(); this.onEvent({ type: 'nexus-exit', code }); } });
    proc.on('error', (err) => { if (mine()) this.onEvent({ type: 'nexus-error', message: err.message }); });
    // Verfuegbare Modelle von Claude Code holen (kostet nichts, geht nicht ans Modell)
    this._request({ subtype: 'initialize' }, (r) => {
      const models = (r?.response?.models || []).filter((m) => m && typeof m.value === 'string')
        .map((m) => ({ value: m.value, label: String(m.displayName || m.value), description: String(m.description || '') }));
      if (models.length) this.onEvent({ type: 'nexus-models', models });
    });
  }

  _request(request, cb) {
    const id = crypto.randomUUID();
    if (cb) this.ownRequests.set(id, cb);
    this._write({ type: 'control_request', request_id: id, request });
  }

  _onData(chunk) {
    this.buf += chunk.toString('utf8');
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let d;
      try { d = JSON.parse(line); } catch { continue; }
      this._route(d);
    }
  }

  _route(d) {
    if (d.type === 'system' && d.subtype === 'thinking_tokens') return;
    if (d.type === 'stream_event') {
      const e = d.event || {};
      if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
        return this.onEvent({ type: 'text-delta', index: e.index, text: e.delta.text, parent: d.parent_tool_use_id || null });
      }
      if (e.type === 'message_start') return this.onEvent({ type: 'message-start', parent: d.parent_tool_use_id || null });
      return;
    }
    if (d.type === 'control_request' && d.request?.subtype === 'can_use_tool') {
      this.pending.set(d.request_id, d.request);
      if (this.pushOnly && !isPush(d.request)) return this.answerPermission(d.request_id, 'allow');
      return this.onEvent({
        type: 'permission',
        requestId: d.request_id,
        tool: d.request.tool_name,
        displayName: d.request.display_name,
        description: d.request.description,
        input: d.request.input,
        suggestions: d.request.permission_suggestions || [],
      });
    }
    if (d.type === 'control_response' && this.ownRequests.has(d.response?.request_id)) {
      const cb = this.ownRequests.get(d.response.request_id);
      this.ownRequests.delete(d.response.request_id);
      return cb(d.response);
    }
    if (d.type === 'control_request') {
      // Andere Steuer-Anfragen kennt der Prototyp nicht -> sauber als Fehler beantworten.
      return this._write({ type: 'control_response', response: { subtype: 'error', request_id: d.request_id, error: 'not supported by NEXUS' } });
    }
    if (d.type === 'system' && d.subtype === 'init' && typeof d.session_id === 'string') this.sessionId = d.session_id;
    if (d.type === 'conversation_reset') this.sessionId = null;
    if (d.type === 'result') { this.turnOpen = false; this._clearStop(); }
    // assistant, user (tool_result), result, system:init, rate_limit_event, permission_denied …
    this.onEvent({ type: 'raw', data: d });
  }

  _write(obj) {
    if (this.proc.stdin.writable) this.proc.stdin.write(JSON.stringify(obj) + '\n');
  }

  // content: Text oder Inhalts-Array (Bilder + Text), vom Hauptprozess geprueft.
  send(content) {
    this.turnOpen = true;
    this._write({ type: 'user', message: { role: 'user', content: Array.isArray(content) ? content : String(content) } });
  }

  answerPermission(requestId, decision) {
    const req = this.pending.get(requestId);
    if (!req) return;
    this.pending.delete(requestId);
    let response;
    if (decision === 'deny') {
      response = { behavior: 'deny', message: this.denyMessage };
    } else {
      response = { behavior: 'allow', updatedInput: req.input };
      if (decision === 'always' && req.permission_suggestions?.length) response.updatedPermissions = req.permission_suggestions;
    }
    this._write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } });
  }

  // Stoppen: erst freundlich (interrupt). Kommt binnen FORCE_STOP_MS kein Abschluss – oder drueckt man
  // ein zweites Mal –, beendet NEXUS den haengenden Prozess und setzt die Sitzung in einem neuen fort.
  interrupt() {
    if (this.turnOpen && this.stopTimer) return this.forceStop();
    this._write({ type: 'control_request', request_id: crypto.randomUUID(), request: { subtype: 'interrupt' } });
    if (this.turnOpen && !this.stopTimer) this.stopTimer = setTimeout(() => this.forceStop(), FORCE_STOP_MS);
  }

  _clearStop() { clearTimeout(this.stopTimer); this.stopTimer = null; }

  forceStop() {
    this._clearStop();
    if (!this.turnOpen) return;
    const old = this.proc;
    this.turnOpen = false;
    this.pending.clear();
    this.ownRequests.clear();
    // neuer Prozess zuerst, damit Ereignisse des alten ab sofort ignoriert werden
    this._spawn({ resumeId: this.sessionId });
    try { old.stdin.end(); } catch { /* schon zu */ }
    killTree(old);
    // fuer die Ansicht wie ein abgebrochener Auftrag: "Gestoppt", eingereihte Nachrichten gehen weiter
    this.onEvent({ type: 'nexus-notice', key: 'chat.forceStopped' });
    this.onEvent({ type: 'raw', data: { type: 'result', subtype: 'error_during_execution', is_error: true, result: 'interrupt (NEXUS)', num_turns: 1 } });
  }

  setMode(mode) {
    if (!MODES.has(mode)) return;
    this.mode = mode;
    this.pushOnly = mode === 'pushOnly';
    this._request({ subtype: 'set_permission_mode', mode: cliMode(mode) }, (r) => {
      if (r.subtype !== 'success') this.onEvent({ type: 'nexus-notice', key: 'chat.modeFailed', detail: r.error || r.error_code || '?' });
    });
  }

  // Modell wechseln; gilt ab der naechsten Nachricht. Antwort: aufgeloester Modellname oder Fehler.
  setModel(model) {
    if (typeof model !== 'string' || !/^[a-z0-9.-]{1,60}$/i.test(model)) return;
    this._request({ subtype: 'set_model', model }, (r) => {
      if (r.subtype !== 'success') return this.onEvent({ type: 'nexus-notice', key: 'chat.modelFailed', detail: r.error || '?' });
      this.model = model === 'default' ? null : model; // gilt auch nach einem Neustart (forceStop)
      this.onEvent({ type: 'nexus-model', model: r.response?.model || model });
    });
  }

  // Beenden: erst freundlich (stdin schliessen), dann den ganzen Prozessbaum
  // (unter Windows laeuft Claude Code als Kind von cmd.exe, siehe platform.js)
  close(immediate = false) {
    try { this.proc.stdin.end(); } catch { /* schon zu */ }
    const kill = () => killTree(this.proc);
    if (immediate) kill(); else setTimeout(kill, 3000);
  }
}

module.exports = { ChatSession, isPush };
