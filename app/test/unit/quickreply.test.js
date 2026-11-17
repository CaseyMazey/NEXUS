const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze } = require('../../src/renderer/quickreply');

test('Ja/Nein-Fragen am Ende werden erkannt', () => {
  const r = analyze('**Läuft gerade:** Docker und Vite.\n\nEs ist noch nichts committet. Soll ich committen, pushen und einen Merge Request für Issue #3 anlegen?');
  assert.equal(r.yesNo, true);
  assert.match(r.question, /^Soll ich committen/);
  assert.equal(analyze('Möchtest du, dass ich die Tests auch anpasse?').yesNo, true);
  assert.equal(analyze('Done. Should I open a pull request?').yesNo, true);
});

test('offene Fragen und Antworten ohne Frage: keine Ja/Nein-Knoepfe', () => {
  assert.equal(analyze('Welche Farbe soll der Knopf haben?').yesNo, false);
  assert.equal(analyze('Fertig, alle Tests sind gruen.'), null);
  assert.equal(analyze('```js\nif (a?) {}\n```\nAlles erledigt.'), null);
});
