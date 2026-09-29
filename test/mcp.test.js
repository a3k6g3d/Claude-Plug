'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('MCP server: initialize, list, outline, symbol, path safety', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-mcp-'));
  fs.writeFileSync(path.join(dir, 'a.py'), 'import os\n\ndef alpha():\n    return 1\n\ndef beta():\n    return 2\n');
  fs.writeFileSync(path.join(dir, 'b.js'), 'function gamma(x) {\n  if (x) {\n    return 1;\n  }\n  return 2;\n}\nfunction delta() {}\n');
  const msgs = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'outline', arguments: { path: 'a.py' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'symbol', arguments: { name: 'gamma' } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'symbol', arguments: { name: 'beta' } } },
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'outline', arguments: { path: '../../etc/passwd' } } },
  ].map((m) => JSON.stringify(m)).join('\n') + '\n';
  const r = spawnSync('node', [path.join(__dirname, '..', 'mcp', 'server.js')], { cwd: dir, input: msgs, env: Object.assign({}, process.env, { CLAUDE_PLUGIN_DATA: dir }) });
  const out = r.stdout.toString().trim().split('\n').map((l) => JSON.parse(l));
  assert.strictEqual(out.length, 6); // notification gets no reply
  assert.strictEqual(out[0].result.serverInfo.name, 'token-thrifty');
  assert.strictEqual(out[1].result.tools.length, 3);
  assert.ok(out[2].result.content[0].text.includes('L3: def alpha():'));
  const g = out[3].result.content[0].text;
  assert.ok(g.includes('b.js:1') && g.includes('return 2;') && !g.includes('delta'));
  const b = out[4].result.content[0].text;
  assert.ok(b.includes('return 2') && !b.includes('alpha'));
  assert.ok(out[5].result.isError);
});
