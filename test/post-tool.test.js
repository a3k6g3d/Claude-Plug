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
    input: JSON.stringify({ session_id: 'testsess', tool_name: 'PowerShell', tool_response: { stdout: full } }),
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
    env: Object.assign({}, process.env, { CLAUDE_PLUGIN_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'tt-data-')) }),
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
