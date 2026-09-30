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

// Measured, not guessed: the first assistant turn of each recent session reports the real context size.
function measuredBaseline() {
  const root = path.join(os.homedir(), '.claude', 'projects');
  const files = [];
  (function walk(d) {
    try {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else if (e.name.endsWith('.jsonl')) files.push({ p, m: fs.statSync(p).mtimeMs });
      }
    } catch (_) { /* no projects dir */ }
  })(root);
  const vals = [];
  for (const f of files.sort((a, b) => b.m - a.m).slice(0, 40)) {
    try {
      for (const l of fs.readFileSync(f.p, 'utf8').split(/\r?\n/)) {
        if (!l.includes('"usage"')) continue;
        const o = JSON.parse(l);
        const u = o.type === 'assistant' && o.message && o.message.usage;
        if (u) { const n = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0); if (n > 0) vals.push(n); break; }
      }
    } catch (_) { /* skip unreadable transcript */ }
  }
  vals.sort((a, b) => a - b);
  return vals.length ? { n: vals.length, median: vals[vals.length >> 1], max: vals[vals.length - 1] } : null;
}
const mb = measuredBaseline();
if (mb) {
  lines.push(`Measured: median session starts at ~${mb.median.toLocaleString()} tokens of context before your first prompt (max ${mb.max.toLocaleString()}, ${mb.n} recent sessions).`);
  lines.push('Most of that is the app itself (system prompt, built-in tools, bundled plugins and connectors). Disable connectors/plugins you never use in the app settings; the estimate above only covers CLAUDE.md and .mcp.json.');
}
lines.push(`Estimated from CLAUDE.md/.mcp.json only: ~${total.toLocaleString()} tokens (MCP counted at ~3k each; estimate).`);
lines.push('Tips: /mcp to disable unused servers; keep CLAUDE.md short and stable for cache hits.');
console.log(lines.join('\n'));
