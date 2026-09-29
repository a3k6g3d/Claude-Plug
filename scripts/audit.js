'use strict';
// Estimate the fixed context "tax" paid every session: CLAUDE.md files, MCP servers, skills.
const fs = require('fs');
const os = require('os');
const path = require('path');

const tok = (n) => Math.round(n / 4);
const size = (p) => { try { return fs.statSync(p).size; } catch (_) { return 0; } };
const lines = [];
let total = 0;

for (const p of [path.join(process.cwd(), 'CLAUDE.md'), path.join(os.homedir(), '.claude', 'CLAUDE.md')]) {
  const s = size(p);
  if (s) { lines.push(`CLAUDE.md ${p}: ~${tok(s)} tokens${tok(s) > 2000 ? '  <- trim it (aim < 2000)' : ''}`); total += tok(s); }
}
for (const p of [path.join(process.cwd(), '.mcp.json'), path.join(os.homedir(), '.claude.json')]) {
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const n = Object.keys(j.mcpServers || {}).filter((k) => k !== 'token-thrifty').length;
    if (n) { lines.push(`MCP servers in ${p}: ${n} (each commonly costs 1-18k tokens of tool definitions)`); total += n * 3000; }
  } catch (_) { /* absent */ }
}
const skillsDir = path.join(process.cwd(), '.claude', 'skills');
try {
  const n = fs.readdirSync(skillsDir).length;
  lines.push(`Project skills: ${n} (only names+descriptions load up front)`);
} catch (_) { /* none */ }
lines.push(`Rough fixed cost before your first prompt: ~${total.toLocaleString()} tokens (MCP counted at ~3k each; estimate).`);
lines.push('Tips: /mcp to disable unused servers; keep CLAUDE.md short and stable for cache hits.');
console.log(lines.join('\n'));
