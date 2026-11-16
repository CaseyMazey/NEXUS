// Steuert das installierte Claude Code im Headless-Modus (stream-json) fuer die NEXUS-Chat-Ansicht.
// NEXUS fasst keine Zugangsdaten an: Claude Code nutzt seine eigene Anmeldung.
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

// default = manuell (fragt), auto = Claude Code entscheidet selbst und fragt nur bei Riskantem, plan = nur planen
const MODES = new Set(['default', 'acceptEdits', 'auto', 'plan']);

class ChatSession {
  constructor({ cwd, resumeId, mode, model, env, onEvent }) {
    this.onEvent = onEvent;
    this.pending = new Map(); // request_id -> request (Rueckfragen)
    const args = ['/d', '/c', 'claude', '-p',
      '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--include-partial-messages',
      '--permission-mode', MODES.has(mode) ? mode : 'default',
      '--permission-prompts', 'host', '--permission-prompt-tool', 'stdio'];
    if (resumeId) args.push('--resume', resumeId);
    if (model && /^[a-z0-9.\-]+$/i.test(model)) args.push('--model', model);
    this.proc = spawn(process.env.ComSpec || 'cmd.exe', args, { cwd, env, windowsHide: true });
    this.buf = '';
    this.proc.stdout.on('data', (c) => this._onData(c));
    this.proc.stderr.on('data', (c) => this.onEvent({ type: 'nexus-stderr', text: c.toString('utf8').slice(0, 2000) }));
    this.proc.on('exit', (code) => this.onEvent({ type: 'nexus-exit', code }));
    this.proc.on('error', (err) => this.onEvent({ type: 'nexus-error', message: err.message }));
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
    if (d.type === 'control_request') {
      // Andere Steuer-Anfragen kennt der Prototyp nicht -> sauber als Fehler beantworten.
      return this._write({ type: 'control_response', response: { subtype: 'error', request_id: d.request_id, error: 'not supported by NEXUS prototype' } });
    }
    // assistant, user (tool_result), result, system:init, rate_limit_event, permission_denied …
    this.onEvent({ type: 'raw', data: d });
  }

  _write(obj) {
    if (this.proc.stdin.writable) this.proc.stdin.write(JSON.stringify(obj) + '\n');
  }

  // content: Text oder Inhalts-Array (Bilder + Text), vom Hauptprozess geprueft.
  send(content) {
    this._write({ type: 'user', message: { role: 'user', content: Array.isArray(content) ? content : String(content) } });
  }

  answerPermission(requestId, decision) {
    const req = this.pending.get(requestId);
    if (!req) return;
    this.pending.delete(requestId);
    let response;
    if (decision === 'deny') {
      response = { behavior: 'deny', message: 'Vom Nutzer in NEXUS abgelehnt.' };
    } else {
      response = { behavior: 'allow', updatedInput: req.input };
      if (decision === 'always' && req.permission_suggestions?.length) response.updatedPermissions = req.permission_suggestions;
    }
    this._write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } });
  }

  interrupt() {
    this._write({ type: 'control_request', request_id: crypto.randomUUID(), request: { subtype: 'interrupt' } });
  }

  setMode(mode) {
    if (!MODES.has(mode)) return;
    this._write({ type: 'control_request', request_id: crypto.randomUUID(), request: { subtype: 'set_permission_mode', mode } });
  }

  close() {
    try { this.proc.stdin.end(); } catch {}
    setTimeout(() => { try { this.proc.kill(); } catch {} }, 3000);
  }
}

module.exports = { ChatSession };
