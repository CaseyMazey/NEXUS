// Meine KIs: Web-KIs aufnehmen, anmelden, abmelden, entfernen.
const STATUS_DOT = { in: 'in', unknown: 'unknown', out: 'out' };
const statusText = (id) => t(`ai.status.${state.aiStatus[id] || 'checking'}`);

function renderAis() {
  const rows = state.ais.map((a) => {
    const st = state.aiStatus[a.id];
    const row = el('div', { class: 'ai-row', style: { '--wc': a.color }, title: `${a.label}: ${statusText(a.id)}`, onclick: (e) => { e.stopPropagation(); aiStatusPopover(row, a); } },
      el('span', { class: 'ai-icon' }, a.icon),
      el('span', { class: 'name' }, a.label),
      el('span', { class: 'ai-dot ' + (STATUS_DOT[st] || '') }),
      st === 'out' ? el('button', { class: 'ai-login', onclick: (e) => { e.stopPropagation(); window.nexus.aiLogin(a.id); } }, t('ai.login')) : null);
    return row;
  });
  if (!state.ais.length) rows.push(el('div', { class: 'side-note' }, t('ai.none')));
  $('#ai-list').replaceChildren(...rows);
}

// Statusfenster einer KI (Klick in "Meine KIs")
function aiStatusPopover(anchor, a) {
  const st = state.aiStatus[a.id];
  const uses = Object.entries(state.desks).flatMap(([pid, d]) => d.workspaces.filter((w) => w.type === a.id).map(() => pid));
  const deskNames = [...new Set(uses)].map((pid) => project(pid)?.name).filter(Boolean);
  const act = (label, fn, cls = '') => el('button', { class: cls, onclick: (e) => { e.stopPropagation(); closeOverlay(); fn(); } }, label);
  openOverlay(anchor, [el('div', { class: 'ai-pop', style: { '--wc': a.color } },
    el('div', { class: 'ap-head' }, el('span', { class: 'ai-icon' }, a.icon),
      el('div', {}, el('div', { class: 'ap-name' }, a.label), el('div', { class: 'm-sub' }, a.url)),
      el('span', { class: 'm-status ' + (STATUS_DOT[st] || '') }, statusText(a.id))),
    el('div', { class: 'ap-hint' }, t(`ai.hint.${st || 'checking'}`)),
    el('div', { class: 'm-sub' }, uses.length ? tn('ai.usedIn', uses.length, { desks: deskNames.join(', ') }) : t('ai.unused')),
    el('div', { class: 'ap-btns' },
      act(st === 'out' ? t('ai.login') : t('ai.openAccount'), () => window.nexus.aiLogin(a.id), st === 'out' ? 'primary' : ''),
      act(t('ai.openHere'), () => { if (project()) addWorkspace(a.id); }),
      act(t('ai.manage'), () => openAiManager())))]);
  // rechts neben der Zeile statt darunter (Seitenleiste)
  const pop = $('#popover');
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${r.right + 8}px`;
  pop.style.top = `${Math.max(8, Math.min(r.top - 8, innerHeight - pop.offsetHeight - 8))}px`;
}
window.nexus.onAiStatus((id, st) => {
  state.aiStatus[id] = st;
  renderAis();
  if (modalOpen && modalRender) modalRender();
  if (state.project) renderDesk();
});
$('#ai-add').onclick = () => openAiManager();

async function refreshAfterAiChange(ais) {
  state.ais = ais;
  const st = await window.nexus.getState();
  state.desks = st.desks;
  // Live-Instanzen entfernter KIs aufraeumen
  for (const [id, l] of [...live]) if (wsInfo(l.type).removed) destroyLive(id);
  state.aiStatus = await window.nexus.aiStatus();
  renderAis(); renderProjects(); if (state.project) renderDesk();
  if (modalOpen && modalRender) modalRender();
}

function openAiManager() {
  const picked = new Set();
  let error = '';
  const render = () => {
    const box = modalBox();
    const mine = state.ais.map((a) => {
      const st = state.aiStatus[a.id];
      return el('div', { class: 'm-ai', style: { '--wc': a.color } },
        el('span', { class: 'ai-icon' }, a.icon),
        el('div', { class: 'm-ai-text' }, el('div', {}, a.label), el('div', { class: 'm-sub' }, a.url)),
        el('span', { class: 'm-status ' + (STATUS_DOT[st] || '') }, statusText(a.id)),
        el('button', { class: st === 'out' ? 'primary' : '', onclick: () => window.nexus.aiLogin(a.id) }, st === 'out' ? t('ai.login') : t('ai.openAccount')),
        st && st !== 'out' ? el('button', { title: t('ai.logoutHint'), onclick: () => confirmDialog(
          { title: t('ai.logoutTitle', { ai: a.label }), text: t('ai.logoutText'), yes: t('ai.logout'), danger: true },
          async () => { await window.nexus.aiLogout(a.id); await refreshAfterAiChange(state.ais); openAiManager(); }) }, t('ai.logout')) : null,
        el('button', { class: 'danger', title: t('ai.removeHint'), onclick: () => {
          const n = Object.values(state.desks).reduce((k, d) => k + d.workspaces.filter((w) => w.type === a.id).length, 0);
          confirmDialog({ title: t('ai.removeTitle', { ai: a.label }), text: (n ? tn('ai.removeTextWs', n) : t('ai.removeText')) + '\n' + t('ai.removeKeeps'), yes: t('ai.remove'), danger: true },
            async () => { await refreshAfterAiChange(await window.nexus.aiRemove(a.id)); openAiManager(); });
        } }, '✕'));
    });
    const have = new Set(state.ais.map((a) => a.id));
    const offer = state.catalog.filter((c) => !have.has(c.id)).map((c) => el('label', { class: 'm-pick' + (picked.has(c.id) ? ' on' : ''), style: { '--wc': c.color } },
      el('input', { type: 'checkbox', ...(picked.has(c.id) ? { checked: '' } : {}), onchange: (e) => { if (e.target.checked) picked.add(c.id); else picked.delete(c.id); render(); } }),
      el('span', { class: 'ai-icon' }, c.icon), el('span', {}, c.label)));
    const nameIn = el('input', { type: 'text', placeholder: t('ai.customName'), maxlength: '40' });
    const urlIn = el('input', { type: 'url', placeholder: 'https://…' });
    const add = async () => {
      error = '';
      const custom = urlIn.value.trim() ? { label: nameIn.value, url: urlIn.value } : null;
      if (!picked.size && !custom) { error = t('ai.pickOne'); render(); return; }
      try {
        const before = new Set(state.ais.map((a) => a.id));
        const ais = await window.nexus.aiAdd([...picked], custom);
        picked.clear();
        await refreshAfterAiChange(ais);
        // gleich das Anmeldefenster der ersten neuen KI oeffnen
        const fresh = ais.filter((a) => !before.has(a.id));
        if (fresh[0]) window.nexus.aiLogin(fresh[0].id);
      } catch (e) { error = errText(e); render(); }
    };
    box.replaceChildren(...[
      el('div', { class: 'm-head' }, el('h2', {}, t('ai.title')), el('button', { onclick: closeModal }, t('common.done'))),
      el('p', { class: 'm-sub' }, t('ai.intro')),
      mine.length ? el('div', { class: 'm-list' }, ...mine) : el('div', { class: 'side-note' }, t('ai.none')),
      el('h3', {}, t('ai.addButton')),
      offer.length ? el('div', { class: 'm-grid' }, ...offer) : el('div', { class: 'side-note' }, t('ai.allAdded')),
      el('div', { class: 'm-custom' }, el('div', { class: 'm-sub' }, t('ai.customLabel')), nameIn, urlIn),
      error ? el('div', { class: 'm-error' }, error) : null,
      el('div', { class: 'm-foot' }, el('button', { class: 'primary', onclick: add }, t('ai.addAndLogin'))),
    ].filter(Boolean));
  };
  openModal(render);
}
