// Tastenkuerzel von NEXUS. Erkannt im Hauptprozess (auch wenn eine KI-Webseite den Fokus hat)
// und als Name an die Oberflaeche geschickt. mod = ⌘ auf dem Mac, sonst Strg.
//   mod+1…9        Projekt 1…9 (Reihenfolge der Seitenleiste)
//   mod+⇧+1…4      Raster mit 1…4 Plaetzen
//   Strg+Tab       naechster Workspace (mit ⇧ vorheriger)
//   mod+K          Schnellsuche
//   mod+N          neuer Claude-Code-Chat (3C)
//   mod+⇧+N        neuer Codex-Chat
//   mod+,          Einstellungen
//   mod+W          aktiven Workspace schliessen
function shortcutFor(i, isMac) {
  if (!i || i.type !== 'keyDown') return null;
  const mod = isMac ? i.meta : i.control;
  const key = String(i.key || '').toLowerCase();
  const digit = /^Digit([1-9])$/.exec(i.code || '');
  if (i.control && key === 'tab') return i.shift ? 'ws:prev' : 'ws:next';
  if (!mod || i.alt) return null;
  if (digit && i.shift && Number(digit[1]) <= 4) return `layout:${digit[1]}`;
  if (digit && !i.shift) return `project:${digit[1]}`;
  if (key === 'k' && !i.shift) return 'palette';
  if (key === 'n') return i.shift ? 'new-codex' : 'new-chat';
  if (key === ',' && !i.shift) return 'settings';
  if (key === 'w' && !i.shift) return 'close-ws';
  return null;
}

module.exports = { shortcutFor };
