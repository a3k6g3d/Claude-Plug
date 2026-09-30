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

test('file-read commands get a 300-line cap, other commands keep 120', () => {
  const { run, isFileRead } = require('../scripts/lib/pipeline');
  assert.ok(isFileRead('sed -n 1,250p src/app.ts'));
  assert.ok(isFileRead('cd "I:/proj" && cat -n src/app.ts'));
  assert.ok(isFileRead('Get-Content src/app.ts'));
  assert.ok(!isFileRead('npm test 2>&1 | tail -20'));
  assert.ok(!isFileRead('git log --oneline'));
  const src = Array.from({ length: 250 }, (_, i) => `const value${i} = compute(${i}); // some line of code`).join('\n');
  assert.ok(!run(src, () => 'S', 'sed -n 1,250p src/app.ts').changed);      // whole file kept
  assert.ok(run(src, () => 'S', 'npm run build').text.includes('lines omitted')); // ordinary output is trimmed
  const big = Array.from({ length: 600 }, (_, i) => `const value${i} = compute(${i}); // some line of code`).join('\n');
  assert.ok(run(big, () => 'S', 'cat src/big.ts').text.includes('lines omitted')); // huge dumps still trimmed
});

test('data-style commands get a high cap; logs keep the ordinary one', () => {
  const { run, isDataCommand } = require('../scripts/lib/pipeline');
  assert.ok(isDataCommand('git log --stat -40'));
  assert.ok(isDataCommand('cd "I:/proj" && git diff HEAD~3'));
  assert.ok(isDataCommand('grep -rn "TODO" src'));
  assert.ok(isDataCommand('Get-ChildItem -Recurse'));
  assert.ok(!isDataCommand('npm test'));
  assert.ok(!isDataCommand('git status'));
  assert.ok(!isDataCommand('node --test dist'));
  const rows = Array.from({ length: 500 }, (_, i) => ` src/file${i}.ts | ${i % 40 + 1} ++++`).join('\n');
  assert.ok(!run(rows, () => 'S', 'git log --stat -40').changed);             // 500 data rows kept whole
  assert.ok(run(rows, () => 'S', 'npm run build').text.includes('lines omitted')); // same rows as a log are trimmed
  const huge = Array.from({ length: 2000 }, (_, i) => ` src/file${i}.ts | ${i % 40 + 1} ++++`).join('\n');
  assert.ok(run(huge, () => 'S', 'git log --stat').text.includes('lines omitted')); // extreme outputs still capped
});

test('go test -v, cargo test and unittest formats collapse; failures stay', () => {
  const go = [
    ...Array.from({ length: 6 }, (_, i) => `=== RUN   TestThing${i}\n--- PASS: TestThing${i} (0.00s)`),
    '=== RUN   TestBroken', '--- FAIL: TestBroken (0.01s)', '    broken_test.go:12: expected 2, got 3', 'FAIL', 'FAIL\tgithub.com/x/y\t0.020s',
  ].join('\n');
  const g = collapsePassing(go);
  assert.ok(g.collapsed >= 12);
  assert.ok(g.text.includes('--- FAIL: TestBroken'));
  assert.ok(g.text.includes('expected 2, got 3'));
  assert.ok(g.text.includes('FAIL\tgithub.com/x/y'));

  const cargo = [...Array.from({ length: 9 }, (_, i) => `test util::case_${i} ... ok`), 'test util::bad ... FAILED', 'test result: FAILED. 9 passed; 1 failed'].join('\n');
  const c = collapsePassing(cargo);
  assert.strictEqual(c.collapsed, 9);
  assert.ok(c.text.includes('test util::bad ... FAILED'));
  assert.ok(c.text.includes('9 passed; 1 failed'));

  const ut = [...Array.from({ length: 8 }, (_, i) => `test_case_${i} (pkg.tests.Suite) ... ok`), 'test_bad (pkg.tests.Suite) ... FAIL', 'AssertionError: 1 != 2'].join('\n');
  const u = collapsePassing(ut);
  assert.strictEqual(u.collapsed, 8);
  assert.ok(u.text.includes('test_bad (pkg.tests.Suite) ... FAIL'));
  assert.ok(u.text.includes('AssertionError: 1 != 2'));

  const pkgs = [...Array.from({ length: 9 }, (_, i) => `ok  \tgithub.com/x/pkg${i}\t0.${i}12s`), 'FAIL\tgithub.com/x/bad\t0.3s'].join('\n');
  assert.strictEqual(collapsePassing(pkgs).collapsed, 9);
  assert.ok(collapsePassing(pkgs).text.includes('FAIL\tgithub.com/x/bad'));
});
