// Welche Adressen duerfen KI-Fenster und Anmeldefenster ansteuern? (ohne Electron, damit testbar)

// Hosts, ueber die sich viele Anbieter anmelden lassen.
const AUTH_HOSTS = ['accounts.google.com', 'accounts.youtube.com', 'appleid.apple.com', 'login.live.com',
  'login.microsoftonline.com', 'challenges.cloudflare.com'];

// Googles Anmeldeseite in Laenderversionen (accounts.google.de, .at, .co.uk, .com.br …).
// Nach der Bestaetigung setzt Google dort per Weiterleitung (/accounts/SetSID) die Anmelde-Cookies.
// Wird das blockiert, haengt die Anmeldung 15–25 s auf der Bestaetigungsseite.
// Freigegeben ist nur die Anmeldeseite selbst, keine anderen Google-Seiten.
const GOOGLE_ACCOUNTS_CC = /^accounts\.google\.(com?\.)?[a-z]{2}$/;

const isAuthHost = (hostname) => AUTH_HOSTS.includes(hostname) || GOOGLE_ACCOUNTS_CC.test(hostname);

function hostAllowed(provider, raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  if (isAuthHost(u.hostname)) return true;
  return provider.hosts.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
}

// Login-/Auth-Seiten erkennen (werden nie als Chat-Adresse gespeichert).
function isAuthUrl(raw) {
  try {
    const u = new URL(raw);
    if (isAuthHost(u.hostname) || /^(auth|login|accounts?|signin)\./.test(u.hostname)) return true;
    return /(^|\/)(login|log-in|signin|sign-in|signup|sign-up|auth|oauth|sso|verify|register)(\/|$)/i.test(u.pathname);
  } catch { return true; }
}

// Nur Ursprung + Pfad speichern (Query/Fragment koennen Tokens enthalten).
function safeUrl(raw) {
  try { const u = new URL(raw); return u.origin + u.pathname; } catch { return ''; }
}

module.exports = { AUTH_HOSTS, GOOGLE_ACCOUNTS_CC, isAuthHost, hostAllowed, isAuthUrl, safeUrl };
