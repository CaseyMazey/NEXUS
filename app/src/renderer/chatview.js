/* global marked, DOMPurify */
// 3C – Claude-Code-Chat-Ansicht (eine Instanz pro Workspace).
// Exportiert window.NexusChat.create(container, opts) -> view
// opts.t / opts.tn / opts.locale: Uebersetzung (kommt aus core.js)
(function () {
  const TOOL_ICONS = { Read: '📖', Write: '📝', Edit: '✏️', MultiEdit: '✏️', Bash: '💻', PowerShell: '💻', Glob: '🔎', Grep: '🔎', WebFetch: '🌐', WebSearch: '🌐', Task: '🤖', Agent: '🤖', TodoWrite: '✅' };
  const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const MAX_IMAGE = 5 * 1024 * 1024;
  // eingebaute Befehle mit eigener Beschreibung (Schluessel slash.<befehl>)
  const BUILTIN = ['clear', 'compact', 'context', 'model', 'usage', 'init', 'review', 'code-review', 'effort', 'recap', 'rename'];
  const CLAUDE_MODES = ['default', 'acceptEdits', 'auto', 'pushOnly', 'bypassPermissions', 'plan'];
  // Codex: die Sandbox bestimmt, was er darf (er fragt im exec-Modus nicht nach)
  const CODEX_MODES = ['read-only', 'workspace-write', 'danger-full-access'];

  function el(tag, props = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'style') Object.assign(e.style, v);
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else e.setAttribute(k, v);
    }
    for (const c of children) if (c != null) e.append(c);
    return e;
  }
  function md(text) {
    const div = el('div', { class: 'md' });
    div.innerHTML = DOMPurify.sanitize(marked.parse(text || '', { gfm: true, breaks: true }));
    div.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
    return div;
  }
  function toolSummary(input = {}) {
    if (input.file_path || input.path) return String(input.file_path || input.path).split(/[\\/]/).pop();
    return String(input.command || input.pattern || input.url || input.query || input.description || input.prompt || '').slice(0, 140);
  }

  function create(container, opts) {
    const { t, tn } = opts;
    const p = opts.project;

    function toolCard(item) {
      const card = el('details', { class: 'tool' + (item.isError ? ' error' : '') });
      card.append(el('summary', {}, el('span', { class: 'ti' }, TOOL_ICONS[item.name] || '🔧'), el('b', {}, item.name), el('span', { class: 'ts' }, toolSummary(item.input))));
      const body = el('div', { class: 'tool-body' }, el('pre', {}, JSON.stringify(item.input, null, 2).slice(0, 6000)));
      if (item.result != null) body.append(el('div', { class: 'tool-result-label' }, item.isError ? t('chat.error') : t('chat.result')), el('pre', {}, String(item.result).slice(0, 6000)));
      card.append(body);
      card._body = body;
      return card;
    }
    // aufeinanderfolgende Werkzeug-Karten in einer Gruppe buendeln (wie in der Claude-App)
    function toolGroupFor() {
      const last = inner.lastElementChild;
      if (last && last.classList.contains('tool-group')) return last;
      const g = el('details', { class: 'tool-group' }, el('summary', {}, ''));
      g._count = 0;
      inner.append(g);
      return g;
    }
    function updateGroupLabel(g) {
      const names = [...g.querySelectorAll(':scope > .tool summary b')].map((b) => b.textContent);
      const uniq = [...new Set(names)].slice(0, 4).join(', ');
      g.firstElementChild.textContent = `🔧 ${tn('chat.steps', g._count)} · ${uniq}`;
      // Standard: eingeklappt (Klick klappt auf/zu); "Ausgeklappt" oeffnet neue Gruppen gleich
      if (root.classList.contains('tools-always')) g.open = true;
    }

    const log = el('div', { class: 'chat-log' });
    const inner = el('div', { class: 'chat-inner' });
    // Denk-Anzeige: steht immer unter dem letzten Eintrag, solange Claude arbeitet
    const thinkText = el('span', { class: 'think-text' }, t('chat.thinking'));
    const thinkTime = el('span', { class: 'think-time' });
    const thinking = el('div', { class: 'thinking', hidden: '' }, el('span', { class: 'think-icon' }, '✳'), thinkText, thinkTime);
    log.append(inner, thinking);
    const attachRow = el('div', { class: 'attach-row', hidden: '' });
    const isCodex = opts.agent === 'codex';
    const MODES = isCodex ? CODEX_MODES : CLAUDE_MODES;
    const mkey = (m) => (isCodex ? `codexmode.${m}` : `mode.${m}`);
    const placeholder = t(isCodex ? 'codex.placeholder' : 'chat.placeholder');
    const input = el('textarea', { rows: '1', placeholder, title: t('chat.inputHint') });
    // alle Dateiarten: Bilder gehen direkt an Claude, alles andere als Kopie mit Pfad
    const fileInput = el('input', { type: 'file', multiple: '', hidden: '' });
    // Clippy 📎 – bleibt so, wie er ist
    const attachBtn = el('button', { class: 'icon-btn', title: t('chat.attach') }, '📎');
    const sendBtn = el('button', { class: 'send', title: t('chat.send') }, '↑');
    const stopBtn = el('button', { class: 'stop', title: t('chat.stop'), hidden: '' }, '■');
    // Rechte-Modus (Dropdown). Auto fragt bei Riskantem nach; "Nie fragen" erlaubt alles.
    let mode = MODES.includes(opts.getMode?.()) ? opts.getMode() : MODES[isCodex ? 1 : 0];
    const modeSel = el('select', { title: t('chat.permissions') },
      ...MODES.map((m) => el('option', { value: m, title: t(`${mkey(m)}.hint`), ...(m === mode ? { selected: '' } : {}) }, t(mkey(m)))));
    const modeHint = () => {
      modeSel.title = `${t('chat.permissions')}: ${t(`${mkey(mode)}.hint`)}`;
      modeSel.classList.toggle('auto', mode === 'auto');
      modeSel.classList.toggle('bypass', mode === 'bypassPermissions' || mode === 'danger-full-access');
      modeSel.classList.toggle('pushonly', mode === 'pushOnly');
    };
    modeHint();
    modeSel.onchange = () => {
      mode = modeSel.value;
      modeHint();
      if (view.chatId) window.nexus.chatMode(view.chatId, mode);
      opts.onMode?.(mode);
    };
    // KI-Modell (Liste liefert Claude Code selbst); gilt ab der naechsten Nachricht
    let model = opts.getModel?.() || 'default';
    const modelSel = el('select', { class: 'model-sel', title: t('chat.model') }, el('option', { value: model }, model === 'default' ? t('chat.modelDefault') : model));
    function setModels(list) {
      modelSel.replaceChildren(...list.map((m) => el('option', { value: m.value, title: m.description, ...(m.value === model ? { selected: '' } : {}) },
        m.value === 'default' ? `${t('chat.modelDefault')} (${m.description.split(' · ')[0] || t('chat.recommended')})` : m.label)));
      if (!list.some((m) => m.value === model)) { model = 'default'; modelSel.value = 'default'; }
    }
    modelSel.onchange = () => {
      model = modelSel.value;
      if (view.chatId) window.nexus.chatModel(view.chatId, model);
      opts.onModel?.(model);
    };
    const usage = el('div', { class: 'usage' });
    const slashBox = el('div', { class: 'slash-box', hidden: '' });
    const box = el('div', { class: 'composer-box' }, slashBox, attachRow, input, el('div', { class: 'composer-actions' }, attachBtn, modeSel, usage, modelSel, stopBtn, sendBtn), fileInput);
    // Knopf: ans Ende springen (erscheint, sobald man nach oben gescrollt hat)
    const jumpBtn = el('button', { class: 'jump-down', title: t('chat.jumpDown'), hidden: '' }, '↓');
    const composer = el('div', { class: 'composer' }, jumpBtn, box);
    const root = el('div', { class: 'chat' }, log, composer);
    // Arbeitsschritte: always | live (nur waehrend der Arbeit) | never – reine Anzeige, kostet keine Tokens
    // collapsed (Standard) | always (ausgeklappt) | live (nur waehrend der Arbeit) | never
    const setToolDisplay = (m) => {
      const mode = ['collapsed', 'always', 'live', 'never'].includes(m) ? m : 'collapsed';
      for (const k of ['collapsed', 'always', 'live', 'never']) root.classList.toggle('tools-' + k, k === mode);
      if (mode === 'always' || mode === 'collapsed') for (const g of root.querySelectorAll('.tool-group')) g.open = mode === 'always';
    };
    setToolDisplay(opts.getToolDisplay?.());
    container.append(root);

    const view = { chatId: null, sessionId: opts.sessionId || null, busy: false, exited: false };
    const tools = new Map();
    let live = null;
    let turnHadText = false;
    let turnStart = 0;
    let attachments = []; // Bild: { media_type, data, url } · Datei: { file: true, name, size, path?, pending? }
    let queued = []; // Nachrichten, die waehrend eines laufenden Auftrags geschickt wurden
    let suggestion = ''; // Vorschlag fuer die naechste Nachricht (Tab uebernimmt ihn)

    const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 120;
    const scrollDown = () => { log.scrollTop = log.scrollHeight; };
    jumpBtn.onclick = () => { log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' }); };
    log.addEventListener('scroll', () => { jumpBtn.hidden = nearBottom(); });
    const append = (node) => { const stick = nearBottom(); inner.append(node); if (stick) scrollDown(); return node; };

    // ----- Denk-Anzeige -----
    const think = { start: 0, last: 0, timer: null, tool: null, writing: false, waiting: false };
    const dur = (ms) => {
      const s = Math.max(0, Math.round(ms / 1000));
      if (s < 60) return t('time.sec', { s });
      const m = Math.floor(s / 60);
      return m < 60 ? t('time.minSec', { m, s: s % 60 }) : t('time.hourMin', { h: Math.floor(m / 60), m: m % 60 });
    };
    function renderThinking() {
      if (!view.busy) return;
      const now = Date.now();
      const quiet = now - think.last;
      thinkText.textContent = think.waiting ? t('chat.waiting')
        : think.tool ? t('chat.usingTool', { tool: think.tool }) : think.writing ? t('chat.writing') : t('chat.thinking');
      thinking.classList.toggle('paused', think.waiting);
      // lange still, aber Prozess laeuft noch: Hinweis statt Raten
      const stale = !think.waiting && quiet > 90000;
      thinking.classList.toggle('stale', stale);
      thinkTime.textContent = dur(now - think.start) + (stale ? ' · ' + t('chat.stale', { time: dur(quiet) }) : '');
    }
    function setBusy(b) {
      view.busy = b; stopBtn.hidden = !b; opts.onBusy?.(b);
      clearInterval(think.timer);
      thinking.hidden = !b;
      // waehrend eines Auftrags kann man weiter schreiben: die Nachricht wird eingereiht
      sendBtn.title = b ? t('chat.queue') : t('chat.send');
      sendBtn.classList.toggle('queue', b);
      if (b) {
        Object.assign(think, { start: Date.now(), last: Date.now(), tool: null, writing: false, waiting: false });
        think.timer = setInterval(renderThinking, 1000);
        renderThinking();
        if (nearBottom()) scrollDown();
      }
    }
    // jedes Ereignis aus Claude Code zaehlt als Lebenszeichen
    function activity(patch) { think.last = Date.now(); if (patch) Object.assign(think, patch); renderThinking(); }
    // Claude arbeitet weiter (z. B. an eingereihten Nachrichten), obwohl der letzte Auftrag fertig war
    function resumeBusy() { if (!view.busy && !view.exited) { turnStart = Date.now(); turnHadText = false; setBusy(true); } }

    // ----- Uhrzeit und Dauer -----
    const pad = (n) => String(n).padStart(2, '0');
    const clock = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    function when(ts) {
      const d = new Date(ts); const now = new Date();
      const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const diff = Math.round((day(now) - day(d)) / 86400000);
      if (diff === 0) return clock(ts);
      if (diff === 1) return t('time.yesterday', { time: clock(ts) });
      return `${d.toLocaleDateString(opts.locale(), { day: '2-digit', month: '2-digit' })} ${clock(ts)}`;
    }
    const fullDate = (ts) => new Date(ts).toLocaleString(opts.locale(), { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    function addUser(text, imgs = [], ts = Date.now(), isQueued = false, files = [], meta = {}) {
      const bubble = el('div', { class: 'bubble' });
      if (imgs.length) bubble.append(el('div', { class: 'bubble-imgs' }, ...imgs.map((u) => el('img', { src: u }))));
      if (files.length) bubble.append(el('div', { class: 'bubble-files' }, ...files.map((f) => el('span', { class: 'file-chip', title: f.path || f.name }, `${fileIcon(f.name)} ${f.name}`))));
      if (text) bubble.append(el('div', {}, text));
      const msg = el('div', { class: 'msg user' + (isQueued ? ' queued' : '') }, bubble);
      const stamp = el('div', { class: 'stamp', title: t('chat.sentAt', { date: fullDate(ts) }) }, isQueued ? `${when(ts)} · ${t('chat.queued')}` : when(ts));
      const bar = el('div', { class: 'msg-foot' });
      if (ts) bar.append(stamp);
      msg.append(bar);
      msg._stamp = stamp; msg._ts = ts;
      msg._text = text;
      // Abzweigpunkt fuer Bearbeiten/Wiederholen: die Nachricht davor (null = Anfang der Unterhaltung)
      msg._before = 'before' in meta ? meta.before : lastUuid;
      bar.append(actionsFor(msg, 'user'));
      return append(msg);
    }
    // eingereihte Nachrichten als zugestellt markieren
    function deliverQueued() {
      for (const m of queued) { m.classList.remove('queued'); m._stamp.textContent = when(m._ts); }
      queued = [];
    }
    // Abschlusszeile eines Auftrags: wann fertig, wie lange, wie viele Schritte
    function addDone({ end, ms, steps, stopped }) {
      const parts = [el('b', {}, stopped ? '■ ' + t('chat.stopped') : '✓ ' + t('chat.done')), ` ${when(end)}`];
      if (ms) parts.push(` · ${t('chat.duration', { time: dur(ms) })}`);
      if (steps) parts.push(` · ${tn('chat.steps', steps)}`);
      append(el('div', { class: 'note meta done' + (stopped ? ' stopped' : ''), title: t('chat.doneAt', { date: fullDate(end) }) }, ...parts));
    }
    function addAssistant(text, cls = '', uuid = null) { return finishAssistant(append(el('div', { class: 'msg assistant ' + cls }, md(text))), text, uuid); }
    function finishAssistant(node, text, uuid) {
      node._text = text;
      if (uuid) node.dataset.uuid = uuid;
      node.append(actionsFor(node, 'assistant'));
      return node;
    }
    function addTool(item) {
      const g = toolGroupFor();
      const c = toolCard(item);
      g.append(c); g._count++; updateGroupLabel(g);
      tools.set(item.id, { card: c, group: g });
      if (nearBottom()) scrollDown();
    }
    function addNote(text, cls = '') { append(el('div', { class: 'note ' + cls }, text)); }

    // ----- Aktionen an Nachrichten (wie in der Claude-App) -----
    // Kopieren, Bearbeiten, Wiederholen, Verzweigen (nur Claude Code), Anheften, Vorlesen
    let lastUuid = null; // uuid der letzten Nachricht im Verlauf (Abzweigpunkt)
    let editing = null;
    const canFork = !isCodex;
    function actBtn(icon, titleKey, onclick) {
      const b = el('button', { class: 'msg-act', title: t(titleKey) }, icon);
      b.onclick = (e) => { e.stopPropagation(); onclick(b); };
      return b;
    }
    function flash(b, icon) { const old = b.textContent; b.textContent = icon; setTimeout(() => { b.textContent = old; }, 1200); }
    function actionsFor(node, kind) {
      const a = el('div', { class: 'msg-actions' });
      a.append(actBtn('⧉', 'msg.copy', (b) => { navigator.clipboard.writeText(node._text || node.innerText).then(() => flash(b, '✓')); }));
      if (kind === 'user') {
        if (canFork) {
          a.append(actBtn('✎', 'msg.edit', () => startEditing(node)));
          a.append(actBtn('↻', 'msg.retry', () => { if (busyHint()) return; const text = node._text; rewind(node, () => { input.value = text; send(); }); }));
          a.append(actBtn('⑂', 'msg.branch', () => branch(node._before, node._text)));
        }
      } else {
        if (canFork) a.append(actBtn('⑂', 'msg.branch', () => branch(node.dataset.uuid, '')));
        a.append(actBtn('📌', 'msg.pin', () => togglePin(node)));
        a.append(actBtn('🔊', 'msg.read', (b) => readAloud(node, b)));
      }
      return a;
    }
    function busyHint() {
      if (!view.busy) return false;
      addNote(t('msg.busy'), 'warn');
      return true;
    }
    // Bearbeiten: Text ins Eingabefeld, beim Senden geht es ab dieser Stelle neu weiter
    const editBar = el('div', { class: 'edit-bar', hidden: '' });
    function startEditing(node) {
      if (busyHint()) return;
      editing = { msg: node };
      for (const n of inner.querySelectorAll('.msg.editing')) n.classList.remove('editing');
      node.classList.add('editing');
      input.value = node._text || '';
      input.dispatchEvent(new Event('input'));
      editBar.replaceChildren(el('span', {}, '✎ ' + t('msg.editing')), el('button', { onclick: stopEditing }, t('common.cancel')));
      editBar.hidden = false;
      input.focus();
    }
    function stopEditing() {
      if (editing) editing.msg.classList.remove('editing');
      editing = null;
      editBar.hidden = true;
    }
    // Chat ab einer Nutzer-Nachricht zuruecksetzen: diese und alle folgenden Eintraege verschwinden,
    // Claude Code zweigt die Sitzung vor dieser Nachricht ab (das Original bleibt als eigene Sitzung erhalten)
    async function rewind(node, then) {
      if (busyHint()) return;
      const before = node._before;
      const source = view.sessionId;
      let n = node;
      while (n) { const next = n.nextSibling; n.remove(); n = next; }
      lastUuid = before;
      if (view.chatId) window.nexus.chatClose(view.chatId);
      view.chatId = null;
      const res = await window.nexus.openChat({ projectId: p.id, resumeId: before ? source : null, resumeAt: before, fork: !!before, mode, model, agent: opts.agent || 'claude' });
      view.chatId = res.chatId;
      if (!before) { view.sessionId = null; opts.onSession?.(null); }
      then();
    }
    // Verzweigen: neuer Workspace, der an dieser Stelle weitermacht; dieser Chat bleibt unveraendert
    function branch(at, draft) {
      if (!view.sessionId && at) { addNote(t('msg.noSession'), 'warn'); return; }
      opts.onBranch?.({ sessionId: view.sessionId, at, draft });
    }
    // Anheften: angeheftete Antworten stehen oben im Chat (gespeichert je Sitzung)
    const pinBar = el('div', { class: 'pin-bar', hidden: '' });
    const pins = () => (view.sessionId ? opts.getPins?.(view.sessionId) || [] : []);
    function renderPins() {
      const list = pins();
      pinBar.hidden = !list.length;
      pinBar.replaceChildren(...list.map((x) => el('div', { class: 'pin', title: x.text },
        el('span', { class: 'pin-text', onclick: () => inner.querySelector(`[data-uuid="${x.uuid}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, '📌 ' + x.text),
        el('button', { title: t('msg.unpin'), onclick: () => setPins(pins().filter((y) => y.uuid !== x.uuid)) }, '×'))));
      for (const n of inner.querySelectorAll('.msg.assistant[data-uuid]')) n.classList.toggle('pinned', list.some((x) => x.uuid === n.dataset.uuid));
    }
    function setPins(list) { opts.setPins?.(view.sessionId, list); renderPins(); }
    function togglePin(node) {
      const uuid = node.dataset.uuid;
      if (!uuid || !view.sessionId) { addNote(t('msg.noSession'), 'warn'); return; }
      const list = pins();
      if (list.some((x) => x.uuid === uuid)) setPins(list.filter((x) => x.uuid !== uuid));
      else setPins([...list, { uuid, text: (node.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140) }]);
    }
    view.renderPins = renderPins;
    log.prepend(pinBar);
    box.prepend(editBar);
    // Vorlesen mit der Sprachausgabe des Systems
    let speaking = null;
    function readAloud(node, b) {
      const synth = window.speechSynthesis;
      if (!synth) return;
      if (speaking === node) { synth.cancel(); speaking = null; return; }
      synth.cancel();
      // Text der Antwort ohne Markdown-Zeichen (die Knoepfe darunter nicht mitlesen)
      const u = new SpeechSynthesisUtterance(String(node._text || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>|]+/g, ' '));
      u.lang = opts.locale();
      u.onend = () => { if (speaking === node) speaking = null; b.textContent = '🔊'; };
      speaking = node;
      b.textContent = '⏹';
      synth.speak(u);
    }

    // ----- Vorschlag fuer die naechste Nachricht -----
    function setSuggestion(s) {
      suggestion = typeof s === 'string' ? s.trim().slice(0, 500) : '';
      input.placeholder = suggestion ? `${suggestion}   ⇥ ${t('chat.tabToUse')}` : placeholder;
      input.classList.toggle('has-suggestion', !!suggestion);
    }
    function takeSuggestion() {
      if (!suggestion) return false;
      input.value = suggestion;
      setSuggestion('');
      input.dispatchEvent(new Event('input'));
      return true;
    }

    // ----- Anhaenge: Bilder direkt, alle anderen Dateien als Kopie mit Pfad -----
    const sizeText = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
    function fileIcon(name) {
      const ext = String(name).split('.').pop().toLowerCase();
      if (['pdf'].includes(ext)) return '📕';
      if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md'].includes(ext)) return '📄';
      if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return '📊';
      if (['ppt', 'pptx', 'odp'].includes(ext)) return '📽️';
      if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️';
      if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return '🎵';
      if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return '🎬';
      return '📎';
    }
    const pendingFiles = () => attachments.some((a) => a.pending);
    function renderAttachments() {
      attachRow.hidden = !attachments.length;
      attachRow.replaceChildren(...attachments.map((a) => {
        const x = el('button', { class: 'att-x', title: t('common.remove') }, '×');
        x.onclick = () => { attachments = attachments.filter((b) => b !== a); renderAttachments(); };
        if (!a.file) return el('div', { class: 'att' }, el('img', { src: a.url }), x);
        return el('div', { class: 'att att-file' + (a.pending ? ' pending' : ''), title: a.path || a.name },
          el('span', { class: 'att-icon' }, fileIcon(a.name)),
          el('span', { class: 'att-name' }, a.name),
          el('span', { class: 'att-size' }, a.pending ? t('chat.uploading') : sizeText(a.size)), x);
      }));
      sendBtn.disabled = pendingFiles();
    }
    function addFiles(files) {
      for (const f of files) {
        // kleine Bilder sieht Claude direkt
        if (IMAGE_TYPES.includes(f.type) && f.size <= MAX_IMAGE) {
          const reader = new FileReader();
          reader.onload = () => {
            const url = String(reader.result);
            attachments.push({ media_type: f.type, data: url.split(',')[1], url });
            renderAttachments();
          };
          reader.readAsDataURL(f);
          continue;
        }
        // alles andere: Kopie im Anhang-Ordner, Claude bekommt den Pfad
        const a = { file: true, name: f.name || 'datei', size: f.size, pending: true };
        attachments.push(a);
        renderAttachments();
        f.arrayBuffer().then((buf) => window.nexus.chatAttach(a.name, new Uint8Array(buf))).then((r) => {
          Object.assign(a, r, { pending: false });
          renderAttachments();
        }).catch((e) => {
          attachments = attachments.filter((b) => b !== a);
          renderAttachments();
          addNote(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'warn');
        });
      }
    }
    attachBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => { addFiles([...fileInput.files]); fileInput.value = ''; };
    input.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); addFiles(files); }
    });
    root.addEventListener('dragover', (e) => { e.preventDefault(); root.classList.add('drop'); });
    root.addEventListener('dragleave', (e) => { if (e.target === root || !root.contains(e.relatedTarget)) root.classList.remove('drop'); });
    root.addEventListener('drop', (e) => { e.preventDefault(); root.classList.remove('drop'); addFiles([...(e.dataTransfer?.files || [])]); });

    // ----- Slash-Befehle -----
    let slashItems = []; let slashIndex = 0;
    function updateSlash() {
      const m = /^\/([\w:.-]*)$/.exec(input.value);
      if (!m) { slashBox.hidden = true; return; }
      const q = m[1].toLowerCase();
      slashItems = (isCodex ? [] : opts.getSlashCommands()).filter((c) => c.toLowerCase().includes(q))
        .sort((a, b) => (a.toLowerCase().startsWith(q) ? 0 : 1) - (b.toLowerCase().startsWith(q) ? 0 : 1) || a.length - b.length)
        .slice(0, 12);
      slashIndex = 0;
      if (!slashItems.length) { slashBox.hidden = true; return; }
      renderSlash();
      slashBox.hidden = false;
    }
    function renderSlash() {
      slashBox.replaceChildren(...slashItems.map((c, i) => el('div', {
        class: 'slash-item' + (i === slashIndex ? ' on' : ''),
        onmousedown: (e) => { e.preventDefault(); pickSlash(i); },
      }, el('b', {}, '/' + c), el('span', {}, BUILTIN.includes(c) ? t(`slash.${c}`) : (c.includes(':') ? 'Skill' : '')))));
    }
    function pickSlash(i) {
      input.value = '/' + slashItems[i] + ' ';
      slashBox.hidden = true;
      input.focus();
    }

    // ----- Nutzungslimit: automatisch weitermachen (wie Claude Code) -----
    let lastLimitInfo = null;
    let limitTimer = null;
    let limitBanner = null;
    function cancelContinue() {
      clearTimeout(limitTimer); limitTimer = null;
      if (limitBanner) { limitBanner.remove(); limitBanner = null; }
    }
    function continueNow() {
      cancelContinue();
      if (view.exited || view.busy) return;
      input.value = t('limit.continueMsg');
      send();
    }
    function scheduleContinue(resetAt) {
      cancelContinue();
      const auto = opts.getAutoContinue?.() !== false && resetAt;
      const time = resetAt ? when(resetAt) : null;
      const text = !resetAt ? t('limit.hitUnknown') : auto ? t('limit.waiting', { time }) : t('limit.hit', { time });
      limitBanner = append(el('div', { class: 'note limit' },
        el('span', {}, '⏳ ' + text),
        el('button', { class: 'primary', onclick: continueNow }, t('limit.now')),
        auto ? el('button', { onclick: cancelContinue }, t('limit.cancel')) : null));
      if (!auto) return;
      // etwas Puffer nach dem Reset; setTimeout vertraegt hoechstens ~24 Tage
      const wait = Math.min(Math.max(5000, resetAt + 60000 - Date.now()), 2147483000);
      limitTimer = setTimeout(continueNow, wait);
    }
    view.scheduleContinue = scheduleContinue; // fuer Tests

    // ----- Senden (laeuft ein Auftrag, wird die Nachricht eingereiht) -----
    function send() {
      const text = input.value.trim();
      if ((!text && !attachments.length) || view.exited || pendingFiles()) return;
      cancelContinue();
      // Bearbeiten: erst ab der alten Stelle abzweigen, dann die neue Fassung senden
      if (editing) { const e = editing; stopEditing(); rewind(e.msg, () => { input.value = text; send(); }); return; }
      slashBox.hidden = true;
      setSuggestion('');
      const isQueued = view.busy;
      const images = attachments.filter((a) => !a.file);
      const files = attachments.filter((a) => a.file);
      const msg = addUser(text, images.map((a) => a.url), Date.now(), isQueued, files);
      scrollDown();
      // Dateien: Pfade der Kopien an die Nachricht haengen, damit Claude sie lesen kann
      const full = files.length ? `${text}${text ? '\n\n' : ''}${t('chat.attachedFiles')}\n${files.map((f) => `- ${f.path}`).join('\n')}` : text;
      const payload = images.length ? { text: full, images: images.map(({ media_type, data }) => ({ media_type, data })) } : full;
      attachments = []; renderAttachments();
      input.value = ''; input.style.height = '';
      if (isQueued) queued.push(msg);
      else { turnHadText = false; turnStart = Date.now(); setBusy(true); }
      window.nexus.chatSend(view.chatId, payload).then((ok) => {
        if (ok) return;
        if (!isQueued) setBusy(false);
        addNote(t('chat.sendFailed'), 'warn');
      });
      if (!view.titled && text && !text.startsWith('/')) { view.titled = true; opts.onTitle?.(text.slice(0, 40)); }
    }
    sendBtn.onclick = send;
    stopBtn.onclick = () => window.nexus.chatInterrupt(view.chatId);
    input.addEventListener('keydown', (e) => {
      if (!slashBox.hidden) {
        if (e.key === 'ArrowDown') { e.preventDefault(); slashIndex = (slashIndex + 1) % slashItems.length; renderSlash(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); slashIndex = (slashIndex - 1 + slashItems.length) % slashItems.length; renderSlash(); return; }
        if (e.key === 'Tab') { e.preventDefault(); pickSlash(slashIndex); return; }
        // Enter fuehrt den Befehl gleich aus (wie in Claude Code)
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); pickSlash(slashIndex); send(); return; }
        if (e.key === 'Escape') { slashBox.hidden = true; return; }
      }
      // Tab im leeren Feld uebernimmt den Vorschlag
      if (e.key === 'Tab' && !e.shiftKey && !input.value && takeSuggestion()) { e.preventDefault(); return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    input.addEventListener('input', () => { input.style.height = ''; input.style.height = Math.min(input.scrollHeight, 220) + 'px'; updateSlash(); });
    input.addEventListener('blur', () => setTimeout(() => { slashBox.hidden = true; }, 100));

    // ----- Ereignisse aus Claude Code -----
    view.handle = (ev) => {
      if (view.busy) activity();
      if (ev.type === 'message-start' && !ev.parent) { resumeBusy(); live = null; think.writing = false; return; }
      if (ev.type === 'text-delta' && !ev.parent) {
        resumeBusy();
        if (!think.writing) activity({ writing: true, tool: null });
        if (!live) live = { text: '', el: append(el('div', { class: 'msg assistant streaming' })) };
        live.text += ev.text;
        turnHadText = true;
        const stick = nearBottom();
        live.el.replaceChildren(md(live.text));
        if (stick) scrollDown();
        return;
      }
      if (ev.type === 'permission') {
        opts.onWaiting?.(true);
        activity({ waiting: true });
        const always = ev.suggestions.some((s) => s.type === 'setMode' && s.mode === 'acceptEdits') ? t('perm.alwaysEdits') : (ev.suggestions.length ? t('perm.always') : null);
        const card = el('div', { class: 'perm' },
          el('div', { class: 'perm-head' }, el('span', {}, TOOL_ICONS[ev.tool] || '🔐'), el('b', {}, t('perm.wants', { tool: ev.displayName || ev.tool }))),
          el('div', { class: 'perm-desc' }, ev.description || toolSummary(ev.input)),
          el('details', {}, el('summary', {}, t('common.details')), el('pre', {}, JSON.stringify(ev.input, null, 2).slice(0, 6000))));
        const btns = el('div', { class: 'perm-btns' });
        const decide = (decision, label) => {
          window.nexus.chatPermission(view.chatId, ev.requestId, decision);
          btns.replaceChildren(el('span', { class: 'perm-done' }, label));
          card.classList.add(decision === 'deny' ? 'denied' : 'allowed');
          opts.onWaiting?.(false);
          activity({ waiting: false });
        };
        btns.append(el('button', { class: 'primary', onclick: () => decide('allow', '✓ ' + t('perm.allowed')) }, t('perm.allow')));
        if (always) btns.append(el('button', { onclick: () => decide('always', '✓ ' + t('perm.alwaysAllowed')) }, always));
        btns.append(el('button', { class: 'danger', onclick: () => decide('deny', '✗ ' + t('perm.denied')) }, t('perm.deny')));
        card.append(btns);
        if (mode === 'auto') card.append(el('div', { class: 'perm-tip' }, t('perm.autoTip')));
        append(card); scrollDown();
        return;
      }
      if (ev.type === 'raw') {
        const d = ev.data;
        if (d.type === 'system' && d.subtype === 'init') {
          if (d.session_id && d.session_id !== view.sessionId) { view.sessionId = d.session_id; opts.onSession?.(d.session_id); renderPins(); }
          if (d.model) usage.dataset.model = d.model.replace(/^claude-/, '');
          return;
        }
        // /clear: neue Unterhaltung. Alter Verlauf wird blass, die naechste Nachricht startet eine neue Sitzung.
        if (d.type === 'conversation_reset') {
          for (const n of inner.children) n.classList.add('cleared');
          append(el('div', { class: 'note reset' }, t('chat.cleared')));
          view.sessionId = null; opts.onSession?.(null);
          return;
        }
        if (d.type === 'rate_limit_event') { lastLimitInfo = d.rate_limit_info; opts.onUsage?.(d.rate_limit_info); return; }
        if (d.type === 'prompt_suggestion') {
          if (!input.value) setSuggestion(d.suggestion ?? d.prompt ?? d.text ?? (typeof d.content === 'string' ? d.content : ''));
          return;
        }
        if (d.type === 'assistant' && !d.parent_tool_use_id) {
          resumeBusy();
          if (d.uuid) lastUuid = d.uuid;
          for (const c of d.message?.content || []) {
            if (c.type === 'text' && c.text) {
              turnHadText = true;
              if (live) { live.el.classList.remove('streaming'); live.el.replaceChildren(md(c.text)); finishAssistant(live.el, c.text, d.uuid); live = null; } else addAssistant(c.text, '', d.uuid);
            }
            if (c.type === 'tool_use' && !tools.has(c.id)) { live = null; addTool({ id: c.id, name: c.name, input: c.input }); activity({ tool: c.name, writing: false }); }
          }
          return;
        }
        if (d.type === 'user' && Array.isArray(d.message?.content)) {
          if (d.uuid) lastUuid = d.uuid;
          for (const c of d.message.content) {
            if (c.type !== 'tool_result') continue;
            const tl = tools.get(c.tool_use_id);
            if (!tl) continue;
            const text = typeof c.content === 'string' ? c.content : (c.content || []).map((x) => x.text || '').join('\n');
            tl.card.classList.toggle('error', !!c.is_error);
            tl.card._body.append(el('div', { class: 'tool-result-label' }, c.is_error ? t('chat.error') : t('chat.result')), el('pre', {}, text.slice(0, 6000)));
            activity({ tool: null });
          }
          return;
        }
        if (d.type === 'system' && d.subtype === 'permission_denied') { addNote(t('chat.notAllowed', { tool: d.tool_name }), 'warn'); return; }
        if (d.type === 'result') {
          live = null; setBusy(false);
          // lokale Slash-Befehle (z. B. /context) liefern ihre Ausgabe nur hier
          if (!turnHadText && d.result && d.subtype === 'success') addAssistant(String(d.result), 'command-output');
          const failed = d.is_error || d.subtype !== 'success';
          // Nutzungslimit erreicht: Hinweis + automatisch weitermachen, wenn das Kontingent zurueck ist
          const lim = window.NexusLimit.parseLimit(String(d.result || ''), lastLimitInfo);
          if (lim.hit) scheduleContinue(lim.resetAt);
          else if (failed && !/interrupt/i.test(String(d.subtype) + String(d.result || ''))) addNote(t('chat.aborted', { reason: `${d.subtype}${d.result ? ' – ' + String(d.result).slice(0, 200) : ''}` }), 'warn');
          // lokale Befehle (/clear, /context …) laufen ohne Modell: keine Abschlusszeile mit "0 s · 1 Schritt"
          if (d.num_turns !== 0 || failed) addDone({ end: Date.now(), ms: d.duration_ms || (turnStart ? Date.now() - turnStart : 0), steps: d.num_turns, stopped: failed });
          for (const g of inner.querySelectorAll('.tool-group:not(.finished)')) g.classList.add('finished');
          deliverQueued();
          opts.onTurnDone?.();
          return;
        }
        return;
      }
      if (ev.type === 'nexus-models') { setModels(ev.models); return; }
      if (ev.type === 'nexus-model') { usage.dataset.model = String(ev.model).replace(/^claude-/, ''); addNote(t('chat.modelChanged', { model: modelSel.selectedOptions[0]?.textContent || ev.model }), 'meta'); return; }
      if (ev.type === 'nexus-notice') { addNote(t(ev.key, { detail: ev.detail }), 'warn'); return; }
      if (ev.type === 'nexus-stderr') { if (/error/i.test(ev.text)) addNote(ev.text.trim().slice(0, 400), 'warn'); return; }
      if (ev.type === 'nexus-exit' || ev.type === 'nexus-error') {
        view.exited = true; setBusy(false); opts.onWaiting?.(false);
        addNote(ev.type === 'nexus-error' ? t('chat.startFailed', { error: ev.message }) : t('chat.exited', { code: ev.code }), 'warn');
        input.disabled = true;
      }
    };

    view.setUsage = (info) => {
      if (isCodex) return; // Abo-Auslastung gilt nur fuer Claude
      const u = info?.unifiedWindows;
      const f = (w, label) => (w ? `${label} ${Math.round(w.utilization * 100)} %` : '');
      usage.textContent = u ? [f(u.five_hour, t('chat.usage5h')), f(u.seven_day, t('chat.usageWeek'))].filter(Boolean).join(' · ') : '';
      usage.title = t('chat.usageTitle') + (usage.dataset.model ? ' · ' + usage.dataset.model : '');
    };
    view.setBusy = setBusy;
    view.setToolDisplay = setToolDisplay;
    view.focus = () => { input.focus(); };
    view.scrollDown = scrollDown;
    view.destroy = () => { clearInterval(think.timer); clearTimeout(limitTimer); if (view.chatId) window.nexus.chatClose(view.chatId); root.remove(); };

    // Verlauf zeichnen (fortgesetzte Sitzung); nach jedem Auftrag eine Abschlusszeile mit Uhrzeit und Dauer
    function showHistory(items) {
      let start = 0; let end = 0; let open = false;
      const close = () => { if (open && end) addDone({ end, ms: start ? end - start : 0 }); open = false; end = 0; };
      for (const it of items) {
        if (it.kind === 'user') { close(); addUser(it.text, [], it.ts, false, it.files || [], { before: it.before ?? null }); start = it.ts || 0; }
        else { open = true; end = Math.max(end, it.endTs || 0, it.ts || 0); if (it.uuid) lastUuid = it.uuid; if (it.kind === 'assistant') addAssistant(it.text, '', it.uuid); else addTool(it); }
      }
      close();
      for (const g of inner.querySelectorAll('.tool-group')) g.classList.add('finished');
      scrollDown();
    }
    // fuer das Screenshot-Skript: Beispielverlauf anzeigen (ersetzt die Begruessung)
    view.showExample = (items) => { inner.replaceChildren(); showHistory(items); };

    // ----- Start -----
    view.ready = (async () => {
      // abgezweigter Workspace: Verlauf bis zum Abzweigpunkt, Claude Code startet als neue Sitzung (Fork)
      const fork = opts.forkFrom && opts.forkFrom.sessionId && opts.forkFrom.at ? opts.forkFrom : null;
      const res = await window.nexus.openChat({ projectId: p.id, resumeId: fork ? fork.sessionId : view.sessionId, resumeAt: fork?.at, fork: !!fork, mode, model, agent: opts.agent || 'claude' });
      view.chatId = res.chatId;
      if (opts.forkFrom?.draft) { input.value = opts.forkFrom.draft; input.dispatchEvent(new Event('input')); }
      if (fork) addNote(t('msg.branched'), 'meta');
      if (res.history.length) {
        view.titled = true;
        addNote(tn('chat.resumed', res.history.length));
        showHistory(res.history);
        renderPins();
      } else {
        append(el('div', { class: 'welcome' }, el('div', { class: 'wicon', style: { background: p.color + '33' } }, p.icon),
          el('h3', {}, isCodex ? 'Codex' : 'Claude Code'), el('p', {}, t('chat.newIn', { name: p.name }))));
      }
      return view;
    })();
    return view;
  }

  window.NexusChat = { create };
})();
