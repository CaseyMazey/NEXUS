const test = require('node:test');
const assert = require('node:assert/strict');
const { claudeCommand } = require('../../src/main/platform');

test('Claude Code: Windows ueber cmd.exe, macOS/Linux direkt', () => {
  assert.deepEqual(claudeCommand(['-p'], 'win32', { ComSpec: 'C:\\Windows\\system32\\cmd.exe' }),
    { file: 'C:\\Windows\\system32\\cmd.exe', args: ['/d', '/c', 'claude', '-p'] });
  assert.deepEqual(claudeCommand(['auth', 'status'], 'darwin', {}), { file: 'claude', args: ['auth', 'status'] });
  assert.deepEqual(claudeCommand([], 'linux', {}), { file: 'claude', args: [] });
});
