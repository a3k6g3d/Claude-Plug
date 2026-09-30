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

test('safeguard restores error lines lost beyond the compressor cap', () => {
  const { recover } = require('../scripts/lib/pipeline');
  const original = Array.from({ length: 100 }, (_, i) => `ERROR module ${i} failed to link`).join('\n');
  const r = recover(original, 'header only', 'S.txt');
  assert.strictEqual(r.restored, 30);
  assert.ok(r.text.includes('ERROR module 0 failed to link'));
  assert.ok(r.text.includes('70 more not shown (see S.txt)'));
});

test('safeguard ignores passing-test names and lines already shown', () => {
  const { recover } = require('../scripts/lib/pipeline');
  const original = ['✔ a staked position cannot be sold (1ms)', 'ERROR real problem here'].join('\n');
  const shownAlready = recover(original, 'ERROR real problem here\n[collapsed]');
  assert.strictEqual(shownAlready.restored, 0);
  assert.strictEqual(shownAlready.text, 'ERROR real problem here\n[collapsed]');
});

test('pipeline output never loses an error line even with 100 errors mid-output', () => {
  const { run } = require('../scripts/lib/pipeline');
  const lines = Array.from({ length: 600 }, (_, i) => (i >= 100 && i < 200 ? `ERROR issue ${i} broke` : `plain line ${i} of output`));
  const r = run(lines.join('\n'), () => 'S.txt');
  const shown = new Set(r.text.split('\n'));
  const visible = Array.from({ length: 100 }, (_, i) => `ERROR issue ${i + 100} broke`).filter((l) => shown.has(l)).length;
  assert.strictEqual(visible, 70); // 40 kept by the compressor + 30 restored
  assert.ok(r.text.includes('30 more not shown (see S.txt)'));
});
