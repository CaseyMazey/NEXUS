// Pruefungen fuer alles, was aus der Oberflaeche kommt (ohne Electron, damit testbar).
const path = require('node:path');

// Fehler, die der Nutzer sehen soll: Schluessel + Werte, uebersetzt wird beim IPC-Aufruf
class UserError extends Error {
  constructor(key, vars) {
    super(key);
    this.key = key;
    this.vars = vars;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR = /^#[0-9a-f]{6}$/i;
const WSID = /^[a-z0-9-]{4,40}$/;
const MODEL = /^[a-z0-9.-]{1,60}$/i;

function cleanName(name) {
  const n = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (!n || n.length > 60) throw new UserError('err.nameLength');
  return n;
}

// Ordnername fuer "neuer Ordner": keine Pfadtrenner oder unter Windows verbotene Zeichen/Namen
function folderName(name) {
  // eslint-disable-next-line no-control-regex
  if (/[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) {
    throw new UserError('err.folderChars');
  }
  return name;
}

// Stabile ID aus dem Namen; exists(id) sagt, ob sie schon vergeben ist
function newProjectId(name, exists) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
  let id = base;
  for (let i = 2; exists(id); i++) id = `${base}-${i}`;
  return id;
}

const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const isIcon = (v) => typeof v === 'string' && v.length > 0 && v.length <= 8;

// Desk aus der Oberflaeche bereinigen; isWsType(t) sagt, welche Workspace-Typen es gibt
function cleanDesk(desk, isWsType) {
  if (!desk || typeof desk !== 'object') return null;
  const workspaces = (Array.isArray(desk.workspaces) ? desk.workspaces : []).slice(0, 16)
    .filter((w) => w && WSID.test(w.id) && isWsType(w.type))
    .map((w) => ({
      id: w.id, type: w.type,
      title: typeof w.title === 'string' ? w.title.slice(0, 80) : '',
      sessionId: typeof w.sessionId === 'string' && UUID.test(w.sessionId) ? w.sessionId : null,
      url: typeof w.url === 'string' && /^https:\/\/[^\s]{1,500}$/.test(w.url) ? w.url : null,
    }));
  const ids = new Set(workspaces.map((w) => w.id));
  const layout = [1, 2, 3, 4].includes(desk.layout) ? desk.layout : 1;
  const cells = Array.from({ length: 4 }, (_, i) => (Array.isArray(desk.cells) && ids.has(desk.cells[i]) ? desk.cells[i] : null));
  const focus = Number.isInteger(desk.focus) && desk.focus >= 0 && desk.focus < layout ? desk.focus : 0;
  return { layout, cells, focus, workspaces };
}

// Nachricht an Claude Code: Text oder Bilder + Text
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
function buildContent(payload) {
  if (typeof payload === 'string') return payload.trim() && payload.length <= 100000 ? payload : null;
  if (!payload || typeof payload !== 'object') return null;
  const text = typeof payload.text === 'string' ? payload.text.slice(0, 100000) : '';
  const images = Array.isArray(payload.images) ? payload.images.slice(0, 8) : [];
  const content = [];
  for (const img of images) {
    if (!img || !IMAGE_TYPES.has(img.media_type) || typeof img.data !== 'string' || img.data.length > 7_000_000 || !/^[A-Za-z0-9+/=]+$/.test(img.data)) continue;
    content.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
  }
  if (text.trim()) content.push({ type: 'text', text });
  if (!content.length) return null;
  return content.length === 1 && content[0].type === 'text' ? text : content;
}

module.exports = { UserError, UUID, COLOR, WSID, MODEL, cleanName, folderName, newProjectId, samePath, isIcon, cleanDesk, buildContent };
