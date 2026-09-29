'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { outline } = require('../scripts/lib/outline');
const { analyze } = require('../scripts/analyze');

test('outline finds JS and Python definitions with line numbers', () => {
  const js = outline('const a=1;\nexport async function foo() {}\nclass Bar {}\n', 'x.ts');
  assert.deepStrictEqual(js.entries, ['L2: export async function foo() {}', 'L3: class Bar {}']);
  const py = outline('import os\n\ndef f():\n  pass\n', 'x.py');
  assert.deepStrictEqual(py.entries, ['L3: def f():']);
});

function run(script, ev, env) {
  return execFileSync('node', [path.join(__dirname, '..', 'scripts', script)], {
    input: JSON.stringify(ev), env: Object.assign({}, process.env, env),
  }).toString();
}

test('pre-read: outline for big files, dedup for unchanged re-reads, reset clears', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-'));
  const env = { CLAUDE_PLUGIN_DATA: dir };
  const big = path.join(dir, 'big.py');
  fs.writeFileSync(big, 'def hello():\n  pass\n' + '# pad\n'.repeat(50000));
  const out = JSON.parse(run('pre-read.js', { session_id: 't1', cwd: dir, tool_input: { file_path: big } }, env));
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.ok(out.hookSpecificOutput.permissionDecisionReason.includes('L1: def hello():'));

  const small = path.join(dir, 's.txt');
  fs.writeFileSync(small, 'hi');
  const ev = { session_id: 't1', cwd: dir, tool_input: { file_path: small } };
  assert.strictEqual(run('pre-read.js', ev, env), '');
  assert.ok(run('pre-read.js', ev, env).includes('unchanged'));
  run('reset-state.js', { session_id: 't1' }, env);
  assert.strictEqual(run('pre-read.js', ev, env), '');
  fs.appendFileSync(small, '!');
  assert.strictEqual(run('pre-read.js', ev, env), '');
  run('reset-state.js', { session_id: 't1' }, env);
});

test('analyze ranks tool output and flags repeated reads', () => {
  const t = [
    { message: { content: [{ type: 'tool_use', id: '1', name: 'Bash', input: { command: 'npm test' } }] } },
    { message: { content: [{ type: 'tool_result', tool_use_id: '1', content: 'x'.repeat(4000) }] } },
    { message: { content: [{ type: 'tool_use', id: '2', name: 'Read', input: { file_path: 'a.js' } }, { type: 'tool_use', id: '3', name: 'Read', input: { file_path: 'a.js' } }] } },
  ].map((o) => JSON.stringify(o)).join('\n');
  const r = analyze(t);
  assert.strictEqual(r.by.Bash.chars, 4000);
  assert.strictEqual(r.rereads[0][0], 'a.js');
});
