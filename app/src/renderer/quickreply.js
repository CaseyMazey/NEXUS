// Antwort-Vorschlaege fuer 3C: Endet eine Antwort mit einer Ja/Nein-Frage ("Soll ich committen?"),
// bietet NEXUS Knoepfe und einen Tab-Vorschlag an. Claude Code liefert im Headless-Modus keine eigenen.
// Laeuft in der Oberflaeche (window.NexusQuick) und in den Unit-Tests (module.exports).
(function (root) {
  // typische Ja/Nein-Fragen am Satzanfang (deutsch und englisch)
  const YES_NO = /^(soll(en)? (ich|wir)|möchtest du|moechtest du|willst du|darf ich|kann ich|sollen wir|passt (das|es)|ist das (ok|in ordnung)|einverstanden|shall i|should i|do you want|would you like|want me to|can i|may i|is (that|this) (ok|okay|fine))\b/i;

  // letzte Frage am Ende der Antwort (Code-Bloecke und Markdown ignorieren)
  function lastQuestion(text) {
    const plain = String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/[*_`>#]+/g, '').trim();
    if (!plain.endsWith('?')) return null;
    const sentences = plain.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
    return sentences.length ? sentences[sentences.length - 1] : null;
  }

  // Ergebnis: { question, yesNo } oder null
  function analyze(text) {
    const q = lastQuestion(text);
    if (!q) return null;
    return { question: q, yesNo: YES_NO.test(q) };
  }

  const api = { analyze, lastQuestion };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NexusQuick = api;
})(typeof window !== 'undefined' ? window : globalThis);
