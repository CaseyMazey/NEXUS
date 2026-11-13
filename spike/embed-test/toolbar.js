const tabs = document.getElementById('tabs');
const status = document.getElementById('status');
const meta = document.getElementById('meta');
const buttons = {};

window.nexus.onInit(({ providers, cleanUa, electron }) => {
  for (const [key, label] of Object.entries(providers)) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => window.nexus.activate(key);
    tabs.appendChild(b);
    buttons[key] = b;
  }
  meta.textContent = `Electron ${electron} · UA ${cleanUa ? 'bereinigt' : 'Standard'}`;
});

window.nexus.onState((s) => {
  for (const [k, b] of Object.entries(buttons)) b.classList.toggle('active', k === s.active);
  if (s.key !== s.active) return;
  status.classList.toggle('err', !!s.error);
  status.textContent = s.error ? s.error : `${s.loading ? 'Lädt… ' : ''}${s.title || ''} — ${s.url}`;
});

document.getElementById('reload').onclick = () => window.nexus.reload();
document.getElementById('home').onclick = () => window.nexus.home();
document.getElementById('external').onclick = () => window.nexus.openExternal();
document.getElementById('relaunch').onclick = () => window.nexus.relaunch();
document.getElementById('clear').onclick = () => {
  if (confirm('Sitzung dieses Anbieters wirklich löschen?')) window.nexus.clearSession();
};
