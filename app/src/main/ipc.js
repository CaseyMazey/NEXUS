// Aufrufe aus der NEXUS-Oberflaeche. Jeder Wert wird hier geprueft; Anbieterseiten haben keinen Zugriff.
const { ipcMain, dialog, shell } = require('electron');
const { UserError, UUID, COLOR, WSID, cleanDesk, buildContent } = require('./validate');
const { VALIDATORS } = require('./settings');
const { PALETTE, ICONS, isDir } = require('./projects');
const { CATALOG, AI_ID, RESERVED, customAi } = require('./webviews');
const { saveAttachment } = require('./attachments');
const { readContext, writeContext } = require('./context');

const CODE_TYPES = ['claude-code', 'claude-code-term'];

function registerIpc(ctx) {
  const { getWin, store, projects, agents, webviews, aiById, t, applyTheme, projectRoot, updater } = ctx;
  const data = () => store.data;
  const isWsType = (type) => CODE_TYPES.includes(type) || !!aiById(type);

  // Nur die eigene Oberflaeche darf aufrufen; Nutzerfehler kommen uebersetzt an
  const fromUi = (e) => getWin() && e.sender === getWin().webContents;
  const handle = (channel, fn) => ipcMain.handle(channel, async (e, ...args) => {
    if (!fromUi(e)) throw new Error('forbidden');
    try { return await fn(...args); } catch (err) {
      if (err instanceof UserError) throw new Error(t(err.key, err.vars));
      throw err;
    }
  });
  const on = (channel, fn) => ipcMain.on(channel, (e, ...args) => { if (fromUi(e)) fn(...args); });

  function publicAis() {
    return data().ais.map((a) => {
      const c = CATALOG[a.id];
      return c ? { id: a.id, label: c.label, icon: c.icon, color: c.color, url: c.url, verifiable: !!c.authCookie }
        : { id: a.id, label: a.label, icon: a.icon, color: a.color, url: a.url, custom: true, verifiable: false };
    });
  }

  handle('get-state', () => ({
    projects: projects.public(), projectRoot: projectRoot(), sessionMeta: data().sessionMeta, desks: data().desks,
    slashCommands: data().slashCommands, palette: PALETTE, icons: ICONS, ais: publicAis(),
    catalog: Object.entries(CATALOG).map(([id, c]) => ({ id, label: c.label, icon: c.icon, color: c.color, url: c.url })),
    lastProject: data().lastProject || null, settings: data().settings,
    lang: ctx.lang, strings: ctx.strings, migrated: ctx.migrated, recovered: store.recovered,
    version: ctx.version, update: updater.state, claude: ctx.claude.status, platform: process.platform,
  }));
  handle('relaunch', () => ctx.relaunch());
  handle('open-log', () => shell.openPath(ctx.logDir()));
  handle('claude-check', () => ctx.checkClaude());
  // Updates (nur in der installierten App aktiv)
  handle('update-check', () => updater.check(true));
  handle('update-install', () => updater.install());

  // ---------- Projekte ----------
  const { listSessions } = require('./sessions');
  handle('list-sessions', (id) => { const p = projects.byId(id); return p ? listSessions(p.path) : []; });
  handle('update-project', (id, patch) => { projects.update(id, patch || {}); return projects.public(); });
  handle('project-create', (opts) => { const p = projects.create(opts || {}); return { id: p.id, projects: projects.public() }; });
  handle('project-remove', (id) => { projects.remove(id); return projects.public(); });
  handle('project-unlisted', () => projects.unlisted());
  handle('pick-folder', async (start) => {
    const r = await dialog.showOpenDialog(getWin(), { title: t('dialog.pickFolder'), properties: ['openDirectory', 'createDirectory'],
      defaultPath: typeof start === 'string' && isDir(start) ? start : projectRoot() });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('open-folder', (id) => { const p = projects.byId(id); if (p) shell.openPath(p.path); });
  // Projekt-Kontext (gemeinsames Wissen fuer alle KIs), gespiegelt in CLAUDE.md/AGENTS.md
  handle('context-get', (id) => { const p = projects.byId(id); return p && isDir(p.path) ? readContext(p.path) : ''; });
  handle('context-set', (id, text) => {
    const p = projects.byId(id);
    if (!p || typeof text !== 'string') throw new UserError('err.unknownProject');
    if (!isDir(p.path)) throw new UserError('err.folderMissing');
    return { written: writeContext(p.path, text) };
  });

  // ---------- Desks ----------
  handle('save-desk', (projectId, desk) => {
    if (!projects.byId(projectId)) return null;
    const clean = cleanDesk(desk, isWsType);
    if (!clean) return null;
    data().desks[projectId] = clean;
    data().lastProject = projectId;
    store.save();
    return clean;
  });
  handle('update-session-meta', (sessionId, patch = {}) => {
    if (!UUID.test(sessionId)) return;
    const m = data().sessionMeta[sessionId] || {};
    if (patch.color === null) delete m.color;
    else if (patch.color && COLOR.test(patch.color)) m.color = patch.color;
    if (typeof patch.pinned === 'boolean') m.pinned = patch.pinned;
    data().sessionMeta[sessionId] = m;
    store.save();
    return m;
  });
  handle('set-setting', (key, value) => {
    if (VALIDATORS[key] && VALIDATORS[key](value)) {
      data().settings[key] = value;
      store.save();
      if (key === 'theme') applyTheme();
    }
    return data().settings;
  });

  // ---------- Claude Code ----------
  handle('open-terminal', (opts) => agents.openTerminal(opts || {}));
  handle('open-chat', (opts) => agents.openChat(opts || {}));
  handle('chat-send', (chatId, payload) => {
    const content = buildContent(payload);
    if (!content) return false;
    agents.chat(chatId)?.send(content);
    return true;
  });
  handle('chat-permission', (chatId, requestId, decision) => {
    if (['allow', 'always', 'deny'].includes(decision)) agents.chat(chatId)?.answerPermission(String(requestId), decision);
  });
  // Datei fuer 3C ablegen (Kopie im Anhang-Ordner), Rueckgabe: Pfad fuer die Nachricht
  handle('chat-attach', (name, data) => {
    if (typeof name !== 'string' || !(data instanceof Uint8Array)) throw new UserError('err.attachFailed', { name: String(name) });
    try { return saveAttachment(ctx.attachDir, name, data); } catch (e) {
      throw new UserError(e.message === 'too-big' ? 'err.attachTooBig' : 'err.attachFailed', { name });
    }
  });
  handle('chat-interrupt', (chatId) => agents.chat(chatId)?.interrupt());
  handle('chat-mode', (chatId, mode) => agents.chat(chatId)?.setMode(mode));
  handle('chat-model', (chatId, model) => agents.chat(chatId)?.setModel(model));
  handle('chat-close', (chatId) => { agents.chat(chatId)?.close(); agents.chats.delete(chatId); });
  on('term-input', (id, d) => agents.term(id)?.write(d));
  on('term-resize', (id, cols, rows) => { const p = agents.term(id); if (p && cols > 0 && rows > 0) p.resize(cols, rows); });
  on('term-kill', (id) => agents.term(id)?.kill());

  // ---------- Meine KIs ----------
  handle('ai-status', () => webviews.allStatus(data().ais.map((a) => a.id)));
  handle('ai-add', (ids, custom) => {
    for (const id of Array.isArray(ids) ? ids : []) if (CATALOG[id] && !aiById(id)) data().ais.push({ id });
    if (custom && typeof custom === 'object') {
      const ai = customAi(custom.label, custom.url, new Set(data().ais.map((a) => a.id)));
      if (!AI_ID.test(ai.id) || RESERVED.has(ai.id)) throw new UserError('err.badId');
      data().ais.push(ai);
    }
    store.save();
    return publicAis();
  });
  handle('ai-login', (id) => { if (aiById(id)) webviews.openLogin(id); });
  handle('ai-logout', (id) => (aiById(id) ? webviews.logout(id) : null));
  handle('ai-remove', async (id) => {
    if (!aiById(id)) return publicAis();
    await webviews.logout(id);
    data().ais = data().ais.filter((a) => a.id !== id);
    for (const [pid, d] of Object.entries(data().desks)) data().desks[pid] = cleanDesk(d, isWsType);
    store.save();
    return publicAis();
  });

  // ---------- Web-Workspaces ----------
  on('web-ensure', (wsId, type, url) => { if (WSID.test(wsId) && aiById(type)) webviews.ensure(wsId, type, url); });
  on('web-bounds', (wsId, rect) => webviews.setBounds(wsId, rect));
  on('web-hide-all', () => webviews.hideAll());
  on('web-nav', (wsId, action) => { if (['back', 'reload', 'home', 'external'].includes(action)) webviews.nav(wsId, action); });
  on('web-destroy', (wsId) => webviews.destroy(wsId));
}

module.exports = { registerIpc, CODE_TYPES };
