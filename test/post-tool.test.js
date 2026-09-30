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
