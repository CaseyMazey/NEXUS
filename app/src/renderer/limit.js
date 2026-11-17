// Erkennt, ob ein Auftrag am Nutzungslimit gescheitert ist, und wann das Kontingent zurueckkommt.
// Claude Code meldet z. B. "You've hit your 5-hour limit · resets 12:40pm (Europe/Berlin)" oder
// "resets Nov 21, 11am"; dazu kommt rate_limit_event mit status/resetsAt (Unix-Sekunden).
// Laeuft in der Oberflaeche (window.NexusLimit) und in den Unit-Tests (module.exports).
(function (root) {
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const HIT = /hit your [\w\s-]*limit|usage limit (reached|exceeded)|limit reached|out of (extra )?usage|rate limit exceeded/i;

  // Uhrzeit aus dem Text; ohne Datum: heute, oder morgen, falls schon vorbei
  function parseResetText(text, now) {
    const m = /resets?\s+(?:(?:at|on)\s+)?(?:([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text || '');
    if (!m) return null;
    let h = Number(m[3]);
    const min = Number(m[4] || 0);
    const ap = (m[5] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    const d = new Date(now);
    if (m[1] && MONTHS.includes(m[1].toLowerCase())) {
      d.setMonth(MONTHS.indexOf(m[1].toLowerCase()), Number(m[2]));
      d.setHours(h, min, 0, 0);
      if (d.getTime() < now - 86400000) d.setFullYear(d.getFullYear() + 1); // Jahreswechsel
      return d.getTime();
    }
    d.setHours(h, min, 0, 0);
    if (d.getTime() < now - 60000) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  // Ergebnis: { hit, resetAt (ms oder null) }
  function parseLimit(text, info, now = Date.now()) {
    const rejected = info && info.status === 'rejected';
    const hit = HIT.test(text || '') || !!rejected;
    if (!hit) return { hit: false, resetAt: null };
    let resetAt = parseResetText(text, now);
    if (!resetAt && info && Number(info.resetsAt) * 1000 > now) resetAt = Number(info.resetsAt) * 1000;
    return { hit: true, resetAt };
  }

  const api = { parseLimit, parseResetText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NexusLimit = api;
})(typeof window !== 'undefined' ? window : globalThis);
