// Claude Code in NEXUS: Terminal (node-pty) und eigene Chat-Ansicht (3C, headless stream-json).
// NEXUS nutzt das installierte Claude Code der jeweiligen Person mit deren eigener Anmeldung.
const path = require('node:path');
const { ChatSession } = require('./chat');
const { readHistory } = require('./sessions');
const { UserError, UUID } = require('./validate');
const { claudeCommand, isWin } = require('./platform');
const { CodexSession } = require('./codex');

// Umgebung fuer Claude Code: Variablen einer umgebenden Claude-Code-Sitzung entfernen
function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_') || k === 'ELECTRON_RUN_AS_NODE') delete env[k];
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  return env;
}

class Agents {
  // projectById(id); toUi(channel, ...args); onPermission(project, chatId, ev); onSlashCommands(list)
  constructor({ projectById, toUi, onPermission, onSlashCommands, t, attachDir }) {
    Object.assign(this, { projectById, toUi, onPermission, onSlashCommands, t, attachDir });
    this.terms = new Map();
    this.chats = new Map();
    this.nextTermId = 1;
    this.nextChatId = 1;
  }

  project(id, resumeId) {
    const p = this.projectById(id);
    if (!p) throw new UserError('err.unknownProject');
    if (resumeId && !UUID.test(resumeId)) throw new UserError('err.badSession');
    return p;
  }

  openTerminal({ projectId, resumeId, cols, rows }) {
    const project = this.project(projectId, resumeId);
    const pty = require('node-pty');
    const cmd = claudeCommand(resumeId ? ['--resume', resumeId] : []);
    const proc = pty.spawn(cmd.file, cmd.args, {
      name: 'xterm-256color', cols: Math.max(20, cols | 0) || 120, rows: Math.max(5, rows | 0) || 30,
      cwd: project.path, env: cleanEnv(), ...(isWin ? { useConpty: true } : {}),
    });
    const termId = this.nextTermId++;
    this.terms.set(termId, proc);
    proc.onData((d) => this.toUi('term-data', termId, d));
    proc.onExit(({ exitCode }) => { this.terms.delete(termId); this.toUi('term-exit', termId, exitCode); });
    return termId;
  }

  openChat({ projectId, resumeId, resumeAt, fork, mode, model, agent }) {
    const project = this.project(projectId, resumeId);
    const chatId = this.nextChatId++;
    // Testmodus (Oberflaechentests auf GitHub, ohne angemeldete Agenten): Ersatz, der nichts tut
    if (process.env.NEXUS_FAKE_AGENT === '1') {
      const fake = { send() {}, interrupt() {}, setMode() {}, setModel() {}, answerPermission() {}, close() {} };
      this.chats.set(chatId, fake);
      return { chatId, history: [] };
    }
    // Codex: eigener Agent, gleiche Chat-Ansicht (Ereignisse werden in codex.js uebersetzt)
    if (agent === 'codex') {
      const session = new CodexSession({
        cwd: project.path, resumeId, mode, model, env: cleanEnv(),
        addDirs: this.attachDir ? [this.attachDir] : [],
        tmpDir: this.attachDir ? path.join(this.attachDir, 'codex-bilder') : null,
        onEvent: (ev) => this.toUi('chat-event', chatId, ev),
      });
      this.chats.set(chatId, session);
      return { chatId, history: [] };
    }
    const session = new ChatSession({
      cwd: project.path, resumeId, mode, env: cleanEnv(),
      resumeAt: resumeAt && UUID.test(resumeAt) ? resumeAt : null, fork: !!fork,
      model: model && model !== 'default' ? model : null,
      denyMessage: this.t('chat.denied'),
      addDirs: this.attachDir ? [this.attachDir] : [],
      onEvent: (ev) => {
        if (ev.type === 'nexus-exit') this.chats.delete(chatId);
        if (ev.type === 'permission') this.onPermission(project, chatId, ev);
        if (ev.type === 'raw' && ev.data.type === 'system' && ev.data.subtype === 'init' && Array.isArray(ev.data.slash_commands)) {
          this.onSlashCommands(ev.data.slash_commands.filter((s) => typeof s === 'string').slice(0, 400));
        }
        this.toUi('chat-event', chatId, ev);
      },
    });
    this.chats.set(chatId, session);
    const at = resumeAt && UUID.test(resumeAt) ? resumeAt : null;
    return { chatId, history: resumeId ? readHistory(project.path, resumeId, 300, at) : [] };
  }

  chat(id) { return this.chats.get(id); }
  term(id) { return this.terms.get(id); }

  closeAll() {
    for (const t of this.terms.values()) { try { t.kill(); } catch { /* schon beendet */ } }
    for (const c of this.chats.values()) c.close(true);
    this.chats.clear();
    this.terms.clear();
  }
}

module.exports = { Agents, cleanEnv, iconPath: path.join(__dirname, '..', '..', 'build', 'icon.png') };
