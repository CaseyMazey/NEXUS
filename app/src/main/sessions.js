// Liest Claude-Code-Sitzungen aus ~/.claude/projects (nur lesend).
// ACHTUNG: internes, undokumentiertes Format von Claude Code – kann sich aendern.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects');

// Claude Code ersetzt jedes Nicht-Alphanumerische Zeichen im Pfad durch "-".
function encodeProjectPath(p) {
  return path.resolve(p).replace(/[^A-Za-z0-9]/g, '-');
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const t = content.find((c) => c && c.type === 'text' && typeof c.text === 'string');
    return t ? t.text : '';
  }
  return '';
}

function readSession(file) {
  const stat = fs.statSync(file);
  const id = path.basename(file, '.jsonl');
  let title = '';
  let firstPrompt = '';
  let userCount = 0;
  let branch = '';
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    if (!line) continue;
    // Schneller Vorfilter, damit nicht jede Zeile geparst wird.
    const isTitle = line.includes('"custom-title"');
    const isUser = line.startsWith('{"') && line.includes('"type":"user"');
    if (!isTitle && !isUser) continue;
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    if (d.type === 'custom-title' && d.customTitle) title = d.customTitle; // letzter gewinnt
    if (d.type === 'user' && !d.isMeta) {
      const t = textOf(d.message && d.message.content).trim();
      if (t && !t.startsWith('<')) {
        userCount++;
        if (!firstPrompt) firstPrompt = t.slice(0, 120);
        if (d.gitBranch) branch = d.gitBranch;
      }
    }
  }
  return {
    id,
    title: title || firstPrompt || '',
    hasTitle: !!title,
    prompts: userCount,
    branch,
    updated: stat.mtimeMs,
  };
}

function listSessions(projectPath) {
  const dir = path.join(CLAUDE_PROJECTS, encodeProjectPath(projectPath));
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.jsonl')) continue;
    try {
      const s = readSession(path.join(dir, f));
      if (s.prompts > 0) out.push(s);
    } catch { /* unlesbare Sitzung ueberspringen */ }
  }
  return out.sort((a, b) => b.updated - a.updated);
}

// Verlauf einer Sitzung vereinfacht fuer die Chat-Ansicht (nur lesend, letzte N Eintraege).
// until: nur bis einschliesslich der Nachricht mit dieser uuid (fuer abgezweigte Chats).
function readHistory(projectPath, sessionId, limit = 300, until = null) {
  const file = path.join(CLAUDE_PROJECTS, encodeProjectPath(projectPath), sessionId + '.jsonl');
  return fs.existsSync(file) ? readHistoryFile(file, limit, until) : [];
}

// Jeder Eintrag bekommt die uuid seiner Zeile; Nutzer-Nachrichten zusaetzlich "before" = uuid der
// Zeile davor (dort setzt "Bearbeiten"/"Wiederholen" an: Sitzung ab dort abzweigen).
function readHistoryFile(file, limit = 300, until = null) {
  const items = [];
  const toolIndex = new Map();
  let prev = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    if (d.isMeta || d.isSidechain) continue;
    const content = d.message && d.message.content;
    const ts = Date.parse(d.timestamp) || undefined;
    const before = items.length;
    if (d.type === 'user') {
      if (typeof content === 'string') {
        if (content.trim() && !content.startsWith('<')) items.push({ kind: 'user', text: content, before: prev });
      } else if (Array.isArray(content)) {
        for (const c of content) {
          if (c.type === 'text' && c.text && !c.text.startsWith('<')) items.push({ kind: 'user', text: c.text, before: prev });
          if (c.type === 'image') items.push({ kind: 'user', text: '🖼️', before: prev });
          if (c.type === 'tool_result' && toolIndex.has(c.tool_use_id)) {
            const t = items[toolIndex.get(c.tool_use_id)];
            t.result = typeof c.content === 'string' ? c.content : textOf(c.content);
            t.isError = !!c.is_error;
          }
        }
      }
    } else if (Array.isArray(content)) {
      for (const c of content) {
        if (c.type === 'text' && c.text) items.push({ kind: 'assistant', text: c.text });
        if (c.type === 'tool_use') {
          toolIndex.set(c.id, items.length);
          items.push({ kind: 'tool', id: c.id, name: c.name, input: c.input });
        }
      }
    }
    // Zeitstempel fuer Uhrzeit/Dauer im Chat; Werkzeug-Ergebnisse verlaengern das Ende des Werkzeugs
    for (let i = before; i < items.length; i++) { items[i].ts = ts; if (d.uuid) items[i].uuid = d.uuid; }
    if (ts && d.type === 'user' && Array.isArray(content)) {
      for (const c of content) if (c.type === 'tool_result' && toolIndex.has(c.tool_use_id)) items[toolIndex.get(c.tool_use_id)].endTs = ts;
    }
    if (d.uuid) prev = d.uuid;
    if (until && d.uuid === until) break;
  }
  return items.slice(-limit).map((it) => (it.result && it.result.length > 4000 ? { ...it, result: it.result.slice(0, 4000) + ' …' } : it));
}

module.exports = { listSessions, readHistory, readHistoryFile, encodeProjectPath, CLAUDE_PROJECTS };

