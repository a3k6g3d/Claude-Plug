'use strict';
const fs = require('fs');
const path = require('path');
const { outline } = require('./lib/outline');
const state = require('./lib/state');
const { record } = require('./lib/stats');

const SKIP = /\.(png|jpe?g|gif|webp|pdf|ipynb)$/i;
const MAX = Number(process.env.TT_READ_MAX_BYTES) || 200 * 1024;

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
}

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  try {
    if ((process.env.TOKEN_THRIFTY || '').toLowerCase() === 'off') return;
    if ((process.env.TT_READ_GUARD || '').toLowerCase() === 'off') return;
    const ev = JSON.parse(raw);
    const ti = ev.tool_input || {};
    if (!ti.file_path || SKIP.test(ti.file_path)) return;
    const abs = path.resolve(ev.cwd || process.cwd(), ti.file_path);
    const st = fs.statSync(abs);
    const ranged = ti.offset != null || ti.limit != null;

    // 1. Big file, no range: return a structural outline instead of the whole file.
    if (!ranged && st.size > MAX) {
      const o = outline(fs.readFileSync(abs, 'utf8'), abs);
      const body = o.entries.length
        ? o.entries.join('\n')
        : '(no structure detected; use Grep to find what you need)';
      const msg = `token-thrifty: ${ti.file_path} is ${Math.round(st.size / 1024)} KB, ${o.total} lines. Outline below. Call Read again with offset/limit for the part you need (or Grep).\n${body}`;
      record({ tool: 'Read(outline)', before: st.size, after: msg.length });
      return deny(msg);
    }

    // 2. Unchanged re-read of the same range: it is already in context.
    const key = `${abs}|${ti.offset ?? ''}|${ti.limit ?? ''}`;
    const s = state.load(ev.session_id);
    const seen = s[key];
    if (seen && seen.mtimeMs === st.mtimeMs && seen.size === st.size) {
      record({ tool: 'Read(dedup)', before: st.size, after: 0 });
      return deny(`token-thrifty: ${ti.file_path} is unchanged since you last read it this session; use the earlier result already in your context. (If context was compacted, the guard resets automatically.)`);
    }
    s[key] = { mtimeMs: st.mtimeMs, size: st.size };
    state.save(ev.session_id, s);
  } catch (_) { /* missing file etc: let Read report it */ }
});
