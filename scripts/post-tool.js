'use strict';
const { compress } = require('./lib/compress');
const { record } = require('./lib/stats');

function textOf(resp) {
  if (typeof resp === 'string') return resp;
  if (resp && typeof resp === 'object') {
    const parts = [resp.stdout, resp.stderr, resp.output, resp.content].filter((p) => typeof p === 'string' && p);
    if (parts.length) return parts.join('\n');
  }
  return null;
}

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  try {
    if ((process.env.TOKEN_THRIFTY || '').toLowerCase() === 'off') return;
    const ev = JSON.parse(raw);
    const text = textOf(ev.tool_response);
    if (text === null) return;
    const r = compress(text);
    if (!r.changed) return;
    record({ tool: ev.tool_name, before: r.before, after: r.after });
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: r.text },
    }));
  } catch (_) { /* never break the session */ }
});
