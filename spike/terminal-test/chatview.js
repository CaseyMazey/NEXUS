/* global marked, DOMPurify */
// Claude-Code-Chat-Ansicht (eine Instanz pro Workspace).
// Exportiert window.NexusChat.create(container, opts) -> view
(function () {
  const TOOL_ICONS = { Read: '📖', Write: '📝', Edit: '✏️', MultiEdit: '✏️', Bash: '💻', PowerShell: '💻', Glob: '🔎', Grep: '🔎', WebFetch: '🌐', WebSearch: '🌐', Task: '🤖', Agent: '🤖', TodoWrite: '✅' };
  const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const MAX_IMAGE = 5 * 1024 * 1024;
  const BUILTIN_HINTS = { clear: 'Neue Unterhaltung', compact: 'Verlauf zusammenfassen', context: 'Kontext-Nutzung anzeigen', model: 'Modell wechseln', usage: 'Abo-Nutzung', init: 'CLAUDE.md anlegen', review: 'Code prüfen', 'code-review': 'Code prüfen', effort: 'Denkaufwand', recap: 'Zusammenfassung', rename: 'Sitzung umbenennen' };

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
  function toolCard(item) {
    const card = el('details', { class: 'tool' + (item.isError ? ' error' : '') });
    card.append(el('summary', {}, el('span', { class: 'ti' }, TOOL_ICONS[item.name] || '🔧'), el('b', {}, item.name), el('span', { class: 'ts' }, toolSummary(item.input))));
    const body = el('div', { class: 'tool-body' }, el('pre', {}, JSON.stringify(item.input, null, 2).slice(0, 6000)));
    if (item.result != null) body.append(el('div', { class: 'tool-result-label' }, item.isError ? 'Fehler' : 'Ergebnis'), el('pre', {}, String(item.result).slice(0, 6000)));
    card.append(body);
    card._body = body;
    return card;
  }

  // Aufeinanderfolgende Werkzeug-Karten in einer Gruppe buendeln (wie in der Claude-App).
  function toolGroupFor(inner) {
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
    g.firstElementChild.textContent = `🔧 ${g._count} Schritt${g._count === 1 ? '' : 'e'} · ${uniq}`;
    if (g._count <= 2) g.open = true;
  }

  function create(container, opts) {
    // opts: { project, sessionId, getSlashCommands(), onSession(id), onTitle(t), onBusy(b), onWaiting(b), onUsage(info) }
    const p = opts.project;
    const log = el('div', { class: 'chat-log' });
    const inner = el('div', { class: 'chat-inner' });
    // Denk-Anzeige: steht immer unter dem letzten Eintrag, solange Claude arbeitet
    const thinkText = el('span', { class: 'think-text' }, 'Denkt nach…');
    const thinkTime = el('span', { class: 'think-time' });
    const thinking = el('div', { class: 'thinking', hidden: '' }, el('span', { class: 'think-icon' }, '✳'), thinkText, thinkTime);
    log.append(inner, thinking);
    const attachRow = el('div', { class: 'attach-row', hidden: '' });
    const input = el('textarea', { rows: '1', placeholder: 'Nachricht an Claude Code…', title: '/ für Befehle · Bilder einfügen, hineinziehen oder 📎' });
    const fileInput = el('input', { type: 'file', accept: IMAGE_TYPES.join(','), multiple: '', hidden: '' });
    const attachBtn = el('button', { class: 'icon-btn', title: 'Bild anhängen' }, '📎');
    const sendBtn = el('button', { class: 'send', title: 'Senden' }, '↑');
    const stopBtn = el('button', { class: 'stop', title: 'Stoppen', hidden: '' }, '■');
    // Rechte-Modus (Dropdown). Auto = Auto-Modus von Claude Code: entscheidet selbst, fragt nur bei Riskantem.
    const MODE_INFO = {
      default: ['Manuell (fragt)', 'Claude fragt vor Änderungen und Befehlen'],
      acceptEdits: ['Änderungen automatisch', 'Dateiänderungen ohne Nachfrage, Befehle mit Nachfrage'],
      auto: ['Auto', 'Claude entscheidet selbst, fragt aber bei Schritten nach, die Claude Code für riskant hält (z. B. git push)'],
      bypassPermissions: ['Nie fragen ⚠', 'Claude macht alles ohne Rückfrage – auch Löschen, Pushen, Installieren. Nur verwenden, wenn du dem Auftrag vertraust.'],
      plan: ['Nur planen', 'Claude liest und schlägt vor, ändert aber nichts'],
    };
    let mode = MODE_INFO[opts.getMode?.()] ? opts.getMode() : 'default';
    const modeSel = el('select', { title: 'Berechtigungen' },
      ...Object.entries(MODE_INFO).map(([m, [label, hint]]) => el('option', { value: m, title: hint, ...(m === mode ? { selected: '' } : {}) }, label)));
    const modeHint = () => { modeSel.title = 'Berechtigungen: ' + MODE_INFO[mode][1]; modeSel.classList.toggle('auto', mode === 'auto'); modeSel.classList.toggle('bypass', mode === 'bypassPermissions'); };
    modeHint();
    modeSel.onchange = () => {
      mode = modeSel.value;
      modeHint();
      if (view.chatId) window.nexus.chatMode(view.chatId, mode);
      opts.onMode?.(mode);
    };
    // KI-Modell (Liste liefert Claude Code selbst); gilt ab der naechsten Nachricht
    let model = opts.getModel?.() || 'default';
    const modelSel = el('select', { class: 'model-sel', title: 'KI-Modell' }, el('option', { value: model }, model === 'default' ? 'Standard' : model));
    function setModels(list) {
      modelSel.replaceChildren(...list.map((m) => el('option', { value: m.value, title: m.description, ...(m.value === model ? { selected: '' } : {}) },
        m.value === 'default' ? `Standard (${m.description.split(' · ')[0] || 'empfohlen'})` : m.label)));
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
    const composer = el('div', { class: 'composer' }, box);
    const root = el('div', { class: 'chat' }, log, composer);
    container.append(root);

    const view = { chatId: null, sessionId: opts.sessionId || null, busy: false, exited: false };
    const tools = new Map();
    let live = null;
    let turnHadText = false;
    let turnStart = 0;
    let attachments = []; // { media_type, data, url }

    const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 120;
    const scrollDown = () => { log.scrollTop = log.scrollHeight; };
    const append = (node) => { const stick = nearBottom(); inner.append(node); if (stick) scrollDown(); return node; };
    // Status der Denk-Anzeige: was gerade passiert, wie lange schon, und ob noch etwas kommt
    const think = { start: 0, last: 0, timer: null, tool: null, writing: false, waiting: false };
    const secs = (ms) => { const s = Math.floor(ms / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} Min. ${s % 60} s`; };
    function renderThinking() {
      if (!view.busy) return;
      const now = Date.now();
      const quiet = now - think.last;
      thinkText.textContent = think.waiting ? 'Wartet auf deine Entscheidung'
        : think.tool ? `Verwendet ${think.tool}…` : think.writing ? 'Schreibt…' : 'Denkt nach…';
      thinking.classList.toggle('paused', think.waiting);
      // Lange still, aber Prozess laeuft noch: Hinweis statt Raten
      const stale = !think.waiting && quiet > 90000;
      thinking.classList.toggle('stale', stale);
      thinkTime.textContent = secs(now - think.start) + (stale ? ` · seit ${secs(quiet)} keine Rückmeldung – mit ■ abbrechen?` : '');
    }
    function setBusy(b) {
      view.busy = b; stopBtn.hidden = !b; sendBtn.hidden = b; opts.onBusy?.(b);
      clearInterval(think.timer);
      thinking.hidden = !b;
      if (b) {
        Object.assign(think, { start: Date.now(), last: Date.now(), tool: null, writing: false, waiting: false });
        think.timer = setInterval(renderThinking, 1000);
        renderThinking();
        if (nearBottom()) scrollDown();
      }
    }
    // jedes Ereignis aus Claude Code zaehlt als Lebenszeichen
    function activity(patch) { think.last = Date.now(); if (patch) Object.assign(think, patch); renderThinking(); }
    // ----- Uhrzeit und Dauer -----
    const pad = (n) => String(n).padStart(2, '0');
    const clock = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    function when(ts) {
      const d = new Date(ts); const now = new Date();
      const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const diff = Math.round((day(now) - day(d)) / 86400000);
      if (diff === 0) return clock(ts);
      if (diff === 1) return `gestern ${clock(ts)}`;
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${clock(ts)}`;
    }
    const dur = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return `${s} s`; const m = Math.floor(s / 60); return m < 60 ? `${m} Min. ${s % 60} s` : `${Math.floor(m / 60)} Std. ${m % 60} Min.`; };
    const fullDate = (ts) => new Date(ts).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    function addUser(text, imgs = [], ts = Date.now()) {
      const bubble = el('div', { class: 'bubble' });
      if (imgs.length) bubble.append(el('div', { class: 'bubble-imgs' }, ...imgs.map((u) => el('img', { src: u }))));
      if (text) bubble.append(el('div', {}, text));
      const msg = el('div', { class: 'msg user' }, bubble);
      if (ts) msg.append(el('div', { class: 'stamp', title: 'Gesendet ' + fullDate(ts) }, when(ts)));
      append(msg);
    }
    // Abschlusszeile eines Auftrags: wann fertig, wie lange, wie viele Schritte
    function addDone({ end, ms, steps, stopped }) {
      const parts = [el('b', {}, stopped ? '■ Gestoppt' : '✓ Fertig'), ` ${when(end)}`];
      if (ms) parts.push(` · Dauer ${dur(ms)}`);
      if (steps) parts.push(` · ${steps} Schritt${steps === 1 ? '' : 'e'}`);
      append(el('div', { class: 'note meta done' + (stopped ? ' stopped' : ''), title: 'Fertig ' + fullDate(end) }, ...parts));
    }
    function addAssistant(text, cls = '') { append(el('div', { class: 'msg assistant ' + cls }, md(text))); }
    function addTool(item) {
      const g = toolGroupFor(inner);
      const c = toolCard(item);
      g.append(c); g._count++; updateGroupLabel(g);
      tools.set(item.id, { card: c, group: g });
      if (nearBottom()) scrollDown();
    }
    function addNote(text, cls = '') { append(el('div', { class: 'note ' + cls }, text)); }

    // ----- Bilder -----
    function renderAttachments() {
      attachRow.hidden = !attachments.length;
      attachRow.replaceChildren(...attachments.map((a, i) => {
        const x = el('button', { class: 'att-x', title: 'Entfernen' }, '×');
        x.onclick = () => { attachments.splice(i, 1); renderAttachments(); };
        return el('div', { class: 'att' }, el('img', { src: a.url }), x);
      }));
    }
    function addFiles(files) {
      for (const f of files) {
        if (!IMAGE_TYPES.includes(f.type)) { addNote(`Nur Bilder (PNG, JPEG, GIF, WebP): ${f.name || 'Datei'} übersprungen`, 'warn'); continue; }
        if (f.size > MAX_IMAGE) { addNote(`Bild zu groß (max. 5 MB): ${f.name || ''}`, 'warn'); continue; }
        const reader = new FileReader();
        reader.onload = () => {
          const url = String(reader.result);
          attachments.push({ media_type: f.type, data: url.split(',')[1], url });
          renderAttachments();
        };
        reader.readAsDataURL(f);
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
      const v = input.value;
      const m = /^\/([\w:.-]*)$/.exec(v);
      if (!m) { slashBox.hidden = true; return; }
      const q = m[1].toLowerCase();
      const all = opts.getSlashCommands();
      slashItems = all.filter((c) => c.toLowerCase().includes(q))
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
      }, el('b', {}, '/' + c), el('span', {}, BUILTIN_HINTS[c] || (c.includes(':') ? 'Skill' : '')))));
    }
    function pickSlash(i) {
      input.value = '/' + slashItems[i] + ' ';
      slashBox.hidden = true;
      input.focus();
    }

    // ----- Senden -----
    function send() {
      const text = input.value.trim();
      if ((!text && !attachments.length) || view.busy || view.exited) return;
      slashBox.hidden = true;
      addUser(text, attachments.map((a) => a.url));
      scrollDown();
      const payload = attachments.length ? { text, images: attachments.map(({ media_type, data }) => ({ media_type, data })) } : text;
      attachments = []; renderAttachments();
      input.value = ''; input.style.height = '';
      turnHadText = false;
      turnStart = Date.now();
      setBusy(true);
      window.nexus.chatSend(view.chatId, payload).then((ok) => { if (!ok) { setBusy(false); addNote('Nachricht konnte nicht gesendet werden.', 'warn'); } });
      if (!view.titled && text && !text.startsWith('/')) { view.titled = true; opts.onTitle?.(text.slice(0, 40)); }
    }
    sendBtn.onclick = send;
    stopBtn.onclick = () => window.nexus.chatInterrupt(view.chatId);
    input.addEventListener('keydown', (e) => {
      if (!slashBox.hidden) {
        if (e.key === 'ArrowDown') { e.preventDefault(); slashIndex = (slashIndex + 1) % slashItems.length; renderSlash(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); slashIndex = (slashIndex - 1 + slashItems.length) % slashItems.length; renderSlash(); return; }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); pickSlash(slashIndex); return; }
        if (e.key === 'Escape') { slashBox.hidden = true; return; }
      }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    input.addEventListener('input', () => { input.style.height = ''; input.style.height = Math.min(input.scrollHeight, 220) + 'px'; updateSlash(); });
    input.addEventListener('blur', () => setTimeout(() => { slashBox.hidden = true; }, 100));

    // ----- Ereignisse aus Claude Code -----
    view.handle = (ev) => {
      if (view.busy) activity();
      if (ev.type === 'message-start' && !ev.parent) { live = null; think.writing = false; return; }
      if (ev.type === 'text-delta' && !ev.parent) {
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
        const always = ev.suggestions.some((s) => s.type === 'setMode' && s.mode === 'acceptEdits') ? 'Änderungen in diesem Chat immer erlauben' : (ev.suggestions.length ? 'Immer erlauben' : null);
        const card = el('div', { class: 'perm' },
          el('div', { class: 'perm-head' }, el('span', {}, TOOL_ICONS[ev.tool] || '🔐'), el('b', {}, `Claude möchte ${ev.displayName || ev.tool} verwenden`)),
          el('div', { class: 'perm-desc' }, ev.description || toolSummary(ev.input)),
          el('details', {}, el('summary', {}, 'Details'), el('pre', {}, JSON.stringify(ev.input, null, 2).slice(0, 6000))));
        const btns = el('div', { class: 'perm-btns' });
        const decide = (decision, label) => {
          window.nexus.chatPermission(view.chatId, ev.requestId, decision);
          btns.replaceChildren(el('span', { class: 'perm-done' }, label));
          card.classList.add(decision === 'deny' ? 'denied' : 'allowed');
          opts.onWaiting?.(false);
          activity({ waiting: false });
        };
        btns.append(el('button', { class: 'primary', onclick: () => decide('allow', '✓ Erlaubt') }, 'Erlauben'));
        if (always) btns.append(el('button', { onclick: () => decide('always', '✓ Immer erlaubt') }, always));
        btns.append(el('button', { class: 'danger', onclick: () => decide('deny', '✗ Abgelehnt') }, 'Ablehnen'));
        card.append(btns);
        append(card); scrollDown();
        return;
      }
      if (ev.type === 'raw') {
        const d = ev.data;
        if (d.type === 'system' && d.subtype === 'init') {
          if (d.session_id && d.session_id !== view.sessionId) { view.sessionId = d.session_id; opts.onSession?.(d.session_id); }
          if (d.model) usage.dataset.model = d.model.replace(/^claude-/, '');
          return;
        }
        if (d.type === 'rate_limit_event') { opts.onUsage?.(d.rate_limit_info); return; }
        if (d.type === 'assistant' && !d.parent_tool_use_id) {
          for (const c of d.message?.content || []) {
            if (c.type === 'text' && c.text) {
              turnHadText = true;
              if (live) { live.el.classList.remove('streaming'); live.el.replaceChildren(md(c.text)); live = null; } else addAssistant(c.text);
            }
            if (c.type === 'tool_use' && !tools.has(c.id)) { live = null; addTool({ id: c.id, name: c.name, input: c.input }); activity({ tool: c.name, writing: false }); }
          }
          return;
        }
        if (d.type === 'user' && Array.isArray(d.message?.content)) {
          for (const c of d.message.content) {
            if (c.type !== 'tool_result') continue;
            const t = tools.get(c.tool_use_id);
            if (!t) continue;
            const text = typeof c.content === 'string' ? c.content : (c.content || []).map((x) => x.text || '').join('\n');
            t.card.classList.toggle('error', !!c.is_error);
            t.card._body.append(el('div', { class: 'tool-result-label' }, c.is_error ? 'Fehler' : 'Ergebnis'), el('pre', {}, text.slice(0, 6000)));
            activity({ tool: null });
          }
          return;
        }
        if (d.type === 'system' && d.subtype === 'permission_denied') { addNote(`Nicht erlaubt: ${d.tool_name}`, 'warn'); return; }
        if (d.type === 'result') {
          live = null; setBusy(false);
          // Lokale Slash-Befehle (z. B. /context) liefern ihre Ausgabe nur hier.
          if (!turnHadText && d.result && d.subtype === 'success') addAssistant(String(d.result), 'command-output');
          const failed = d.is_error || d.subtype !== 'success';
          if (failed && !/interrupt/i.test(String(d.subtype) + String(d.result || ''))) addNote(`Abgebrochen: ${d.subtype}${d.result ? ' – ' + String(d.result).slice(0, 200) : ''}`, 'warn');
          addDone({ end: Date.now(), ms: d.duration_ms || (turnStart ? Date.now() - turnStart : 0), steps: d.num_turns || 1, stopped: failed });
          opts.onTurnDone?.();
          return;
        }
        return;
      }
      if (ev.type === 'nexus-models') { setModels(ev.models); return; }
      if (ev.type === 'nexus-model') { usage.dataset.model = String(ev.model).replace(/^claude-/, ''); addNote(`Modell gewechselt: ${modelSel.selectedOptions[0]?.textContent || ev.model} (ab der nächsten Nachricht)`, 'meta'); return; }
      if (ev.type === 'nexus-stderr') { if (/error|fehler/i.test(ev.text)) addNote(ev.text.trim().slice(0, 400), 'warn'); return; }
      if (ev.type === 'nexus-exit' || ev.type === 'nexus-error') {
        view.exited = true; setBusy(false); opts.onWaiting?.(false);
        addNote(ev.type === 'nexus-error' ? `Claude Code konnte nicht starten: ${ev.message}` : `Claude Code beendet (Code ${ev.code}). Workspace neu laden (↻), um weiterzumachen.`, 'warn');
        input.disabled = true;
      }
    };

    view.setUsage = (info) => {
      const u = info?.unifiedWindows;
      const f = (w, label) => (w ? `${label} ${Math.round(w.utilization * 100)} %` : '');
      usage.textContent = u ? [f(u.five_hour, '5 Std.'), f(u.seven_day, 'Woche')].filter(Boolean).join(' · ') : '';
      usage.title = 'Nutzung deines Claude-Abos' + (usage.dataset.model ? ' · Modell ' + usage.dataset.model : '');
    };
    view.setBusy = setBusy; // fuer Selbsttests
    view.focus = () => { input.focus(); };
    view.scrollDown = scrollDown;
    view.destroy = () => { clearInterval(think.timer); if (view.chatId) window.nexus.chatClose(view.chatId); root.remove(); };

    // ----- Start -----
    view.ready = (async () => {
      const res = await window.nexus.openChat({ projectId: p.id, resumeId: view.sessionId, mode, model });
      view.chatId = res.chatId;
      if (res.history.length) {
        view.titled = true;
        addNote(`Fortgesetzte Sitzung · ${res.history.length} Einträge`);
        // Nach jedem Auftrag (Nutzer-Nachricht bis zur naechsten) eine Abschlusszeile mit Uhrzeit und Dauer
        let start = 0; let end = 0; let open = false;
        const close = () => { if (open && end) addDone({ end, ms: start ? end - start : 0 }); open = false; end = 0; };
        for (const it of res.history) {
          if (it.kind === 'user') { close(); addUser(it.text, [], it.ts); start = it.ts || 0; }
          else { open = true; end = Math.max(end, it.endTs || 0, it.ts || 0); if (it.kind === 'assistant') addAssistant(it.text); else addTool(it); }
        }
        close();
        scrollDown();
      } else {
        append(el('div', { class: 'welcome' }, el('div', { class: 'wicon', style: { background: p.color + '33' } }, p.icon),
          el('h3', {}, 'Claude Code'), el('p', {}, `Neuer Chat im Ordner ${p.name}.`)));
      }
      return view;
    })();
    return view;
  }

  window.NexusChat = { create };
})();
