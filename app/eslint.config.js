const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'dist/**'] },
  js.configs.recommended,
  {
    files: ['src/main/**/*.js', 'src/preload/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_|^e$|^w$|^d$|^p$|^err$|^wc$|^cert$|^url$', caughtErrors: 'none' }] },
  },
  {
    // Oberflaeche: klassische Skripte, die sich den globalen Namensraum teilen (siehe core.js)
    files: ['src/renderer/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.browser } },
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off', 'no-redeclare': 'off' },
  },
  {
    // in den Tests per page.evaluate im Fenster ausgewertet
    files: ['test/e2e/**/*.js'],
    languageOptions: { globals: { live: 'readonly', state: 'readonly' } },
  },
];
