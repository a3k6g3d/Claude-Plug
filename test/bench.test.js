'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseStream, toRow, checkPlugins, compare, signTest, median } = require('../bench/lib');
const { plan } = require('../bench/run');
const { report } = require('../bench/report');

const stream = [
  JSON.stringify({ type: 'system', subtype: 'init', plugins: [{ name: 'token-thrifty', path: 'x' }] }),
  'not json',
  JSON.stringify({ type: 'assistant', message: {} }),
  JSON.stringify({ type: 'result', is_error: false, total_cost_usd: 0.25, num_turns: 7, duration_ms: 9000, result: 'All 12 tests passed', usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 40 } }),
].join('\n');

test('parses a stream-json run into a row', () => {
  const row = toRow({ task: 't', arm: 'a', rep: 1 }, parseStream(stream), { expect: ['12 tests passed'] });
  assert.strictEqual(row.ok, true);
  assert.strictEqual(row.cost, 0.25);
  assert.strictEqual(row.turns, 7);
  assert.strictEqual(row.totalTokens, 100);
  assert.strictEqual(row.passedExpect, true);
  assert.deepStrictEqual(row.plugins, ['token-thrifty']);
});

test('a missing result event is a failed row, not a crash', () => {
  const row = toRow({ task: 't', arm: 'a', rep: 1 }, parseStream(''));
  assert.strictEqual(row.ok, false);
  assert.strictEqual(row.cost, null);
});

test('checkPlugins flags an arm that did not load what it claims', () => {
  const row = { plugins: ['token-thrifty'] };
  assert.deepStrictEqual(checkPlugins(row, { name: 'baseline', expectPlugins: { 'token-thrifty': false } }).length, 1);
  assert.deepStrictEqual(checkPlugins(row, { name: 'tt', expectPlugins: { 'token-thrifty': true } }), []);
  assert.strictEqual(checkPlugins({ plugins: null }, { name: 'x', expectPlugins: { a: true } }).length, 1);
});

test('sign test and median', () => {
  assert.strictEqual(median([3, 1, 2]), 2);
  assert.strictEqual(median([1, 2, 3, 4]), 2.5);
  assert.ok(signTest([1, 1, 1, 1, 1, 1, 1, 1]) < 0.02);
  assert.strictEqual(signTest([1, -1, 1, -1]), 1);
  assert.strictEqual(signTest([0, 0]), 1);
});

test('compare pairs by task and repeat and reports the direction', () => {
  const rows = [];
  for (let rep = 1; rep <= 6; rep++) for (const task of ['a', 'b']) {
    rows.push({ task, rep, arm: 'baseline', ok: true, cost: 1 });
    rows.push({ task, rep, arm: 'plug', ok: true, cost: 0.8 });
  }
  const c = compare(rows, 'baseline', 'cost').plug;
  assert.strictEqual(c.pairs, 12);
  assert.ok(Math.abs(c.medianDeltaPct + 20) < 1e-9);
  assert.ok(c.ci95[1] < 0);
  assert.ok(report(rows, 'baseline').includes('BETTER (significant)'));
});

test('plan interleaves arms, is deterministic, and covers every combination', () => {
  const tasks = [{ id: 'x' }, { id: 'y' }];
  const arms = [{ name: 'baseline' }, { name: 'plug' }];
  const p1 = plan(tasks, arms, 3);
  const p2 = plan(tasks, arms, 3);
  assert.strictEqual(p1.length, 12);
  assert.deepStrictEqual(p1.map((t) => `${t.task.id}${t.arm.name}${t.rep}`), p2.map((t) => `${t.task.id}${t.arm.name}${t.rep}`));
  assert.strictEqual(plan(tasks, arms, 1, ['x']).length, 2);
});
