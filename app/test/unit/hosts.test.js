// Erlaubte Adressen fuer KI- und Anmeldefenster
const test = require('node:test');
const assert = require('node:assert/strict');
const { hostAllowed, isAuthUrl } = require('../../src/main/hosts');

const claude = { hosts: ['claude.ai', 'anthropic.com', 'claude.com'] };

test('Google-Anmeldung in Laenderversionen ist erlaubt (SetSID nach der Bestaetigung)', () => {
  for (const u of ['https://accounts.google.de/accounts/SetSID', 'https://accounts.google.at/accounts/SetSID', 'https://accounts.google.co.uk/accounts/SetSID',
    'https://accounts.google.com.br/accounts/SetSID', 'https://accounts.google.com/v3/signin/challenge/dp']) {
    assert.ok(hostAllowed(claude, u), u);
    assert.ok(isAuthUrl(u), u);
  }
});

test('andere Google-Seiten und Taeuschungen bleiben gesperrt', () => {
  for (const u of ['https://www.google.de/search?q=x', 'https://mail.google.de/', 'https://accounts.google.de.evil.com/x',
    'https://accounts.google.example/x', 'https://accounts-google.de/x', 'http://accounts.google.de/accounts/SetSID']) {
    assert.ok(!hostAllowed(claude, u), u);
  }
});

test('eigene Hosts des Anbieters und Unterdomains', () => {
  assert.ok(hostAllowed(claude, 'https://claude.ai/new'));
  assert.ok(hostAllowed(claude, 'https://assets-proxy.anthropic.com/x.js'));
  assert.ok(!hostAllowed(claude, 'https://chatgpt.com/'));
  assert.ok(!hostAllowed(claude, 'kein url'));
});
