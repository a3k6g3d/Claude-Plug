'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { compress } = require('../scripts/lib/compress');

test('small output is untouched', () => {
  const r = compress('hello\nworld');
  assert.strictEqual(r.changed, false);
  assert.strictEqual(r.text, 'hello\nworld');
});

test('dedupes repeats, strips ANSI and progress', () => {
  const input = Array(300).fill('\u001b[32mok line\u001b[0m').join('\n') + '\n50%\nfinal';
  const r = compress(input);
  assert.ok(r.changed);
  assert.ok(r.text.includes('ok line (x300)'));
  assert.ok(!r.text.includes('\u001b'));
  assert.ok(r.text.endsWith('final'));
});

test('long output keeps head, tail and buried errors', () => {
  const lines = Array.from({ length: 1000 }, (_, i) => `line ${i}`);
  lines[500] = 'ERROR: something exploded';
  const r = compress(lines.join('\n'));
  assert.ok(r.changed);
  assert.ok(r.text.includes('line 0') && r.text.includes('line 999'));
  assert.ok(r.text.includes('ERROR: something exploded'));
  assert.ok(r.text.split('\n').length < 200);
  assert.ok(r.after < r.before * 0.3);
});

test('carriage-return progress keeps last frame', () => {
  const input = 'a\rb\rc-final\n' + 'x'.repeat(2000);
  const r = compress(input, { maxLineLen: 50 });
  assert.ok(r.text.startsWith('c-final'));
});
