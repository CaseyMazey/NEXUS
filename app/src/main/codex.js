// Codex (OpenAI) als zweiter Agent in NEXUS. Nutzt das installierte Codex der jeweiligen Person mit
// deren eigener Anmeldung. Pro Nachricht ein Lauf von "codex exec --json" (Folgenachrichten mit
// "codex exec resume <id>"). Die Ereignisse werden in das Format uebersetzt, das die Chat-Ansicht
// schon von Claude Code kennt – so teilen sich 3C und Codex eine Oberflaeche.
// Codex fragt im exec-Modus nie nach; was es darf, bestimmt die Sandbox (Modus-Auswahl).
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { killTree, spawnOptions, isWin } = require('./platform');

// Modi = Sandbox von Codex
const MODES = ['read-only', 'workspace-write', 'danger-full-access'];
const MODEL = /^[a-z0-9.\-_]{1,60}$/i;

function cliCommand(args, env = process.env) {
  return isWin ? { file: env.ComSpec || 'cmd.exe', args: ['/d', '/c', 'codex', ...args] } : { file: 'codex', args };
}

// Ein Codex-Ereignis (JSONL-Zeile) -> Ereignisse im Format der Chat-Ansicht (wie Claude Code stream-json)
function mapEvent(e, ctx) {
  const out = [];
  const raw = (data) => out.push({ type: 'raw', data });
  const tool = (id, name, input) => raw({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });
  const result = (id, content, isError) => raw({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: String(content || '').slice(0, 20000), is_error: !!isError }] } });
  const it = e.item || {};
  switch (e.type) {
    case 'thread.started': raw({ type: 'system', subtype: 'init', session_id: e.thread_id }); break;
    case 'turn.started': out.push({ type: 'message-start', parent: null }); break;
    case 'item.started':
      if (it.type === 'command_execution') tool(it.id, 'Bash', { command: it.command });
      break;
    case 'item.completed':
      ctx.steps++;
      if (it.type === 'agent_message' && it.text) raw({ type: 'assistant', message: { content: [{ type: 'text', text: it.text }] } });
      else if (it.type === 'command_execution') { tool(it.id, 'Bash', { command: it.command }); result(it.id, it.aggregated_output, it.exit_code !== 0 || it.status === 'failed'); }
      else if (it.type === 'file_change') {
        const files = (it.changes || []).map((c) => c.path).filter(Boolean);
        tool(it.id, 'Edit', { file_path: files.join(', ') });
        result(it.id, (it.changes || []).map((c) => `${c.kind || 'update'}: ${c.path}`).join('\n'), it.status === 'failed');
      } else if (it.type === 'web_search') { tool(it.id, 'WebSearch', { query: it.query }); result(it.id, '', false); }
      else if (it.type === 'mcp_tool_call') { tool(it.id, `${it.server || 'mcp'}:${it.tool || ''}`, it.arguments || {}); result(it.id, JSON.stringify(it.result || it.error || ''), !!it.error); }
      else if (it.type === 'error' && it.message) out.push({ type: 'nexus-stderr', text: `Codex error: ${it.message}` });
      else ctx.steps--;
      break;
    case 'turn.completed':
      raw({ type: 'result', subtype: 'success', num_turns: Math.max(1, ctx.steps), duration_ms: Date.now() - ctx.start, result: '' });
      break;
    case 'turn.failed':
      raw({ type: 'result', subtype: 'error', is_error: true, result: e.error?.message || 'Codex', num_turns: ctx.steps, duration_ms: Date.now() - ctx.start });
      break;
    case 'error':
      if (e.message) out.push({ type: 'nexus-stderr', text: `Codex error: ${e.message}` });
      break;
    default:
  }
  return out;
}

// Modelle, die Codex anbietet (sichtbare Eintraege aus "codex debug models")
function listModels(env) {
  return new Promise((resolve) => {
    const cmd = cliCommand(['debug', 'models'], env);
    execFile(cmd.file, cmd.args, { env, timeout: 20000, windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
      try {
        const j = JSON.parse(String(stdout));
        const list = Array.isArray(j) ? j : j.models || [];
        resolve(list.filter((m) => m && m.slug && m.visibility !== 'hide').map((m) => ({ value: m.slug, label: m.display_name || m.slug, description: m.description || '' })));
      } catch { resolve([]); }
    });
  });
}

class CodexSession {
  constructor({ cwd, resumeId, mode, model, env, onEvent, addDirs = [], tmpDir }) {
    Object.assign(this, { cwd, env, onEvent, addDirs, tmpDir });
    this.threadId = resumeId || null;
    this.mode = MODES.includes(mode) ? mode : 'workspace-write';
    this.model = model && model !== 'default' && MODEL.test(model) ? model : null;
    this.proc = null;
    this.queue = []; // Nachrichten waehrend eines Laufs: Codex exec kann nicht unterbrochen ergaenzt werden
    this.closed = false;
    listModels(env).then((models) => {
      if (models.length) this.onEvent({ type: 'nexus-models', models: [{ value: 'default', label: 'Standard', description: 'aus deiner Codex-Konfiguration' }, ...models] });
    });
    if (this.threadId) setTimeout(() => this.onEvent({ type: 'raw', data: { type: 'system', subtype: 'init', session_id: this.threadId } }), 0);
  }

  // content: Text oder [Bilder…, Text] wie bei Claude Code; Bilder werden als Datei mitgegeben (-i)
  send(content) {
    if (this.proc) { this.queue.push(content); return; }
    let text = typeof content === 'string' ? content : '';
    const images = [];
    if (Array.isArray(content)) {
      for (const c of content) {
        if (c.type === 'text') text = c.text;
        if (c.type === 'image' && this.tmpDir) {
          const ext = (c.source.media_type.split('/')[1] || 'png').replace('jpeg', 'jpg');
          const f = path.join(this.tmpDir, `codex-bild-${Date.now()}-${images.length}.${ext}`);
          fs.mkdirSync(this.tmpDir, { recursive: true });
          fs.writeFileSync(f, Buffer.from(c.source.data, 'base64'));
          images.push(f);
        }
      }
    }
    const args = ['exec'];
    if (this.threadId) args.push('resume', this.threadId);
    args.push('--json', '--skip-git-repo-check');
    // resume uebernimmt Arbeitsordner und Sandbox nicht immer als Option: per -c setzen
    args.push('-c', `sandbox_mode="${this.mode}"`);
    if (!this.threadId) args.push('-C', this.cwd);
    if (this.model) args.push('-m', this.model);
    for (const d of this.addDirs) args.push('--add-dir', d);
    for (const f of images) args.push('-i', f);
    args.push('-');
    const cmd = cliCommand(args, this.env);
    const ctx = { steps: 0, start: Date.now() };
    const p = spawn(cmd.file, cmd.args, { cwd: this.cwd, env: this.env, ...spawnOptions() });
    this.proc = p;
    let buf = '';
    let finished = false;
    p.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('{')) continue;
        let e;
        try { e = JSON.parse(line); } catch { continue; }
        if (e.type === 'thread.started' && e.thread_id) this.threadId = e.thread_id;
        if (e.type === 'turn.completed' || e.type === 'turn.failed') finished = true;
        for (const ev of mapEvent(e, ctx)) this.onEvent(ev);
      }
    });
    // Codex schreibt interne Protokollzeilen nach stderr; echte Fehler kommen als JSON-Ereignis (error/turn.failed)
    p.stderr.on('data', (c) => console.log('[codex]', c.toString('utf8').trim().slice(0, 500)));
    p.on('error', (err) => { this.proc = null; this.onEvent({ type: 'nexus-error', message: err.message }); });
    p.on('exit', (code) => {
      this.proc = null;
      // abgebrochen oder ohne Abschluss beendet: Chat trotzdem freigeben
      if (!finished && !this.closed) this.onEvent({ type: 'raw', data: { type: 'result', subtype: this.stopped ? 'interrupted' : 'error', is_error: true, result: this.stopped ? 'interrupt' : `Codex beendet (Code ${code})`, num_turns: ctx.steps, duration_ms: Date.now() - ctx.start } });
      this.stopped = false;
      for (const f of images) fs.rm(f, { force: true }, () => {});
      if (this.queue.length && !this.closed) this.send(this.queue.shift());
    });
    p.stdin.end(text);
  }

  interrupt() { if (this.proc) { this.stopped = true; this.queue = []; killTree(this.proc); } }
  setMode(mode) { if (MODES.includes(mode)) this.mode = mode; }
  setModel(model) {
    if (model === 'default') this.model = null;
    else if (typeof model === 'string' && MODEL.test(model)) this.model = model;
    else return;
    this.onEvent({ type: 'nexus-model', model: model });
  }
  answerPermission() { /* Codex exec fragt nicht nach */ }
  close() { this.closed = true; if (this.proc) killTree(this.proc); }
}

module.exports = { CodexSession, mapEvent, listModels, cliCommand, MODES };
