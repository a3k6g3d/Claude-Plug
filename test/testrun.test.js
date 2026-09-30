'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { collapsePassing } = require('../scripts/lib/testrun');
const { run } = require('../scripts/lib/pipeline');

const passes = (n) => Array.from({ length: n }, (_, i) => ` ✓ suite > case ${i} ${i}ms`);

test('collapses passing runs but keeps failures and summary', () => {
  const text = [' RUN v1', ...passes(12), ' × suite > broken case 5ms', '   AssertionError: expected 1 to be 2', ...passes(9), ' Tests  1 failed | 21 passed (22)'].join('\n');
  const r = collapsePassing(text, 'F.txt');
  assert.strictEqual(r.collapsed, 21);
  assert.ok(r.text.includes('× suite > broken case'));
  assert.ok(r.text.includes('AssertionError: expected 1 to be 2'));
  assert.ok(r.text.includes('1 failed | 21 passed'));
  assert.ok(r.text.includes('full output: F.txt'));
  assert.ok(!r.text.includes('case 3 3ms'));
});

test('handles node --test and TAP style passes', () => {
  const node = Array.from({ length: 10 }, (_, i) => `✔ works ${i} (0.5ms)`).concat('✖ breaks (1ms)').join('\n');
  const r = collapsePassing(node);
  assert.strictEqual(r.collapsed, 10);
  assert.ok(r.text.includes('✖ breaks'));
  const tap = Array.from({ length: 9 }, (_, i) => `ok ${i + 1} - t${i}`).concat('not ok 10 - bad').join('\n');
  assert.strictEqual(collapsePassing(tap).collapsed, 9);
  assert.ok(collapsePassing(tap).text.includes('not ok 10 - bad'));
});

test('a pass-looking line that mentions failure stays visible', () => {
  const text = [...passes(10), ' ✓ handles error path and failed retries 3ms'].join('\n');
  assert.ok(collapsePassing(text).text.includes('handles error path and failed retries'));
});

test('few passes are left alone', () => {
  const text = passes(5).join('\n');
  assert.strictEqual(collapsePassing(text).collapsed, 0);
  assert.strictEqual(collapsePassing(text).text, text);
});

test('pipeline spills once and reports savings', () => {
  const text = [...passes(300), ' Tests  300 passed'].join('\n');
  let spills = 0;
  const r = run(text, () => { spills++; return 'SPILL.txt'; });
  assert.ok(r.changed);
  assert.strictEqual(spills, 1);
  assert.ok(r.after < r.before / 4);
  assert.ok(r.text.includes('300 passed'));
});
