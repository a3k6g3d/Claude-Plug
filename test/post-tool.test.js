'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

test('post-tool spills the full output and points at it', () => {
  const lines = Array.from({ length: 400 }, (_, i) => `row ${i} some ordinary output text`);
  lines[200] = 'ERROR row 200 blew up';
  const full = lines.join('\r\n');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-data-'));
  const r = spawnSync('node', [path.join(__dirname, '..', 'scripts', 'post-tool.js')], {
    input: JSON.stringify({ session_id: `spill-${Date.now()}`, tool_name: 'PowerShell', tool_response: { stdout: full } }),
    env: Object.assign({}, process.env, { CLAUDE_PLUGIN_DATA: data }),
    encoding: 'utf8',
  });
  const out = JSON.parse(r.stdout).hookSpecificOutput.updatedToolOutput;
  const m = out.match(/saved to (\S+\.txt);/);
  assert.ok(m, 'marker names the spill file');
  assert.strictEqual(fs.readFileSync(m[1], 'utf8'), full);
  assert.ok(out.includes('ERROR row 200 blew up'));
  assert.ok(out.length < full.length / 2);
});

test('hook dedups a repeated command across calls and resets on compact', () => {
  const state = require('../scripts/lib/state');
  const sid = `dd-${Date.now()}`;
  const out = Array.from({ length: 30 }, (_, i) => `module ${i} compiled in a reasonable amount of time`).join('\n');
  const call = () => spawnSync('node', [path.join(__dirname, '..', 'scripts', 'post-tool.js')], {
    input: JSON.stringify({ session_id: sid, tool_name: 'Bash', tool_input: { command: 'npm run build' }, tool_response: { stdout: out } }),
    env: Object.assign({}, process.env, { TT_DEDUP: 'on', CLAUDE_PLUGIN_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'tt-data-')) }),
    encoding: 'utf8',
  }).stdout;
  try {
    assert.strictEqual(call(), '');                                   // first sight: untouched
    const second = JSON.parse(call()).hookSpecificOutput.updatedToolOutput;
    assert.ok(second.startsWith('[token-thrifty: identical to the output of call #1'));
    state.reset(sid);                                                 // what SessionStart compact|clear does
    assert.strictEqual(call(), '');                                   // earlier output is gone from context
  } finally { state.reset(sid); }
});

test('backfire guard: re-running a trimmed command with identical output turns trimming off', () => {
  const state = require('../scripts/lib/state');
  const sid = `bf-${Date.now()}`;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-data-'));
  const rows = (tag) => Array.from({ length: 400 }, (_, i) => `step ${i} ${tag} did some ordinary build work here`).join('\n');
  const call = (out, cmd) => {
    const r = spawnSync('node', [path.join(__dirname, '..', 'scripts', 'post-tool.js')], {
      input: JSON.stringify({ session_id: sid, tool_name: 'Bash', tool_input: { command: cmd }, tool_response: { stdout: out } }),
      env: Object.assign({}, process.env, { CLAUDE_PLUGIN_DATA: data }),
      encoding: 'utf8',
    }).stdout;
    return r ? JSON.parse(r).hookSpecificOutput.updatedToolOutput : null;
  };
  try {
    const same = rows('a');
    assert.ok(call(same, 'npm run build').includes('lines omitted'));              // first time: trimmed
    const second = call(same, 'npm run build');                                    // same command, same output: backfire
    assert.ok(!second || !second.includes('lines omitted'));                       // now given in full (or as unseen lines only)
    assert.ok(second === null || second.includes('step 200 a did some'));          // the hidden middle is back (null = untouched original)
    const third = call(same, 'npm run build');
    assert.ok(!third || !third.includes('lines omitted'));                         // and trimming stays off for this command
    const stats = fs.readFileSync(path.join(data, 'stats.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
    assert.strictEqual(stats.filter((x) => x.tool === 'backfire').length, 1);
  } finally { state.reset(sid); }
});

test('backfire guard: an edit-and-rerun loop (different output) is still trimmed', () => {
  const state = require('../scripts/lib/state');
  const sid = `loop-${Date.now()}`;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-data-'));
  const rows = (tag) => Array.from({ length: 400 }, (_, i) => `step ${i} ${tag} did some ordinary build work here`).join('\n');
  const call = (out) => {
    const r = spawnSync('node', [path.join(__dirname, '..', 'scripts', 'post-tool.js')], {
      input: JSON.stringify({ session_id: sid, tool_name: 'Bash', tool_input: { command: 'npm run build' }, tool_response: { stdout: out } }),
      env: Object.assign({}, process.env, { CLAUDE_PLUGIN_DATA: data }),
      encoding: 'utf8',
    }).stdout;
    return r ? JSON.parse(r).hookSpecificOutput.updatedToolOutput : null;
  };
  try {
    assert.ok(call(rows('a')).includes('lines omitted'));
    assert.ok(call(rows('b')).includes('lines omitted'));   // code changed, output changed: normal loop, keep trimming
  } finally { state.reset(sid); }
});

test('defaults: dedup is off, and a repeated identical command is not rewritten', () => {
  const state = require('../scripts/lib/state');
  const sid = `nodedup-${Date.now()}`;
  const out = Array.from({ length: 30 }, (_, i) => `module ${i} compiled in a reasonable amount of time`).join('\n');
  const env = Object.assign({}, process.env, { CLAUDE_PLUGIN_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'tt-data-')) });
  delete env.TT_DEDUP;
  const call = () => spawnSync('node', [path.join(__dirname, '..', 'scripts', 'post-tool.js')], {
    input: JSON.stringify({ session_id: sid, tool_name: 'Bash', tool_input: { command: 'npm run build' }, tool_response: { stdout: out } }),
    env, encoding: 'utf8',
  }).stdout;
  try { assert.strictEqual(call(), ''); assert.strictEqual(call(), ''); } finally { state.reset(sid); }
});

test('Grep results get the high data cap, not the ordinary 120-line cap', () => {
  const { run } = require('../scripts/lib/pipeline');
  const rows = Array.from({ length: 500 }, (_, i) => `src/file${i}.ts:${i}:const value = compute(${i});`).join('\n');
  assert.ok(!run(rows, () => 'S', undefined, { data: true }).changed);
  assert.ok(run(rows, () => 'S', undefined, {}).text.includes('lines omitted'));
});

test('lean profile command lists the measured flags', () => {
  const { lines, TOOLS } = require('../scripts/lean');
  const text = lines.join('\n');
  assert.ok(text.includes('--strict-mcp-config'));
  assert.ok(text.includes(TOOLS));
  assert.ok(text.includes('/clear'));
});
