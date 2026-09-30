'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { dedup } = require('../scripts/lib/dedup');

const body = (n, tag = 'a') => Array.from({ length: n }, (_, i) => `module ${tag}${i} compiled in a reasonable amount of time`);

test('identical re-run collapses to a one-line marker', () => {
  const text = body(30).join('\n');
  const first = dedup(text, 'npm run build', []);
  assert.strictEqual(first.text, null);
  const second = dedup(text, 'npm run build', first.mem);
  assert.ok(second.text.startsWith('[token-thrifty: identical to the output of call #1'));
  assert.ok(second.text.length < 200);
});

test('changed lines are shown, everything else omitted', () => {
  const a = body(30);
  const b = a.slice();
  b[10] = 'module a10 compiled with a NEW result';
  const s1 = dedup(a.join('\n'), 'npm run build', []);
  const s2 = dedup(b.join('\n'), 'npm run build', s1.mem);
  assert.ok(s2.text.includes('module a10 compiled with a NEW result'));
  assert.ok(!s2.text.includes('module a5 compiled'));
  assert.ok(s2.text.includes('29 of 30 lines are identical'));
  assert.ok(s2.text.includes('1 line from that output no longer appear'));
});

test('error lines are always kept even if repeated', () => {
  const a = body(30).concat('ERROR disk full while writing');
  const s1 = dedup(a.join('\n'), 'make', []);
  const s2 = dedup(a.join('\n'), 'make', s1.mem);
  assert.ok(s2.text.includes('ERROR disk full while writing'));
});

test('a different command needs an almost complete match', () => {
  const a = body(30);
  const b = a.slice(0, 20).concat(body(10, 'z'));
  const s1 = dedup(a.join('\n'), 'npm run build', []);
  assert.strictEqual(dedup(b.join('\n'), 'ls -la', s1.mem).text, null);
});

test('small outputs are ignored and not remembered', () => {
  const s = dedup('short\noutput', 'ls', []);
  assert.strictEqual(s.text, null);
  assert.strictEqual(s.mem.length, 0);
});

test('memory is capped', () => {
  let mem = [];
  for (let i = 0; i < 12; i++) mem = dedup(body(30, `u${i}x`).join('\n'), `cmd${i}`, mem).mem;
  assert.strictEqual(mem.length, 8);
  assert.strictEqual(mem[7].n, 12);
});
