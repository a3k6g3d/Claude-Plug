'use strict';
// Where did my tokens go? Parses a Claude Code transcript (JSONL) and ranks tool output by size.
const fs = require('fs');
const os = require('os');
const path = require('path');

function newest(dir) {
  let best = null;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) {
        const m = fs.statSync(p).mtimeMs;
        if (!best || m > best.m) best = { p, m };
      }
    }
  };
  try { walk(dir); } catch (_) { /* no projects dir */ }
  return best && best.p;
}

function analyze(text) {
  const uses = {};
  const by = {};
  const big = [];
  const reads = {};
  for (const line of text.split('\n')) {
    if (!line) continue;
    let o; try { o = JSON.parse(line); } catch (_) { continue; }
    const c = o.message && o.message.content;
    if (!Array.isArray(c)) continue;
    for (const b of c) {
      if (b.type === 'tool_use') {
        uses[b.id] = b;
        if (b.name === 'Read' && b.input && b.input.file_path) reads[b.input.file_path] = (reads[b.input.file_path] || 0) + 1;
      } else if (b.type === 'tool_result') {
        const u = uses[b.tool_use_id] || { name: 'unknown', input: {} };
        const len = typeof b.content === 'string' ? b.content.length
          : Array.isArray(b.content) ? b.content.reduce((n, x) => n + (x.text ? x.text.length : 0), 0) : 0;
        const t = (by[u.name] = by[u.name] || { calls: 0, chars: 0 });
        t.calls++; t.chars += len;
        big.push({ len, label: `${u.name}: ${String(u.input.command || u.input.file_path || u.input.pattern || '').slice(0, 70)}` });
      }
    }
  }
  big.sort((a, b) => b.len - a.len);
  const rereads = Object.entries(reads).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { by, top: big.slice(0, 5), rereads };
}

function render(r) {
  const tok = (c) => Math.round(c / 4).toLocaleString();
  const out = ['Tool output by size (~tokens, chars/4):'];
  for (const [n, t] of Object.entries(r.by).sort((a, b) => b[1].chars - a[1].chars)) out.push(`  ${n}: ${t.calls} calls, ~${tok(t.chars)}`);
  out.push('Largest single outputs:');
  for (const b of r.top) out.push(`  ~${tok(b.len)}  ${b.label}`);
  if (r.rereads.length) { out.push('Files read repeatedly:'); for (const [f, n] of r.rereads) out.push(`  ${n}x ${f}`); }
  return out.join('\n');
}

if (require.main === module) {
  const file = process.argv[2] || newest(path.join(os.homedir(), '.claude', 'projects'));
  if (!file) { console.log('No transcript found. Pass a .jsonl path.'); process.exit(0); }
  console.log(`Transcript: ${file}`);
  console.log(render(analyze(fs.readFileSync(file, 'utf8'))));
}

module.exports = { analyze, render };
