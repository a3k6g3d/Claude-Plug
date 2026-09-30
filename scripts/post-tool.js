'use strict';
const { compress } = require('./lib/compress');
const { record } = require('./lib/stats');
const { spill } = require('./lib/spill');

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
    let r = compress(text);
    if (!r.changed) return;
    if (r.text.includes('lines omitted')) {
      const saved = spill(text, ev.session_id);
      if (saved) r = compress(text, { hint: `Full output saved to ${saved}; Grep it or Read it with offset/limit instead of re-running the command.` });
    }
    record({ tool: ev.tool_name, before: r.before, after: r.after });
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: r.text },
    }));
  } catch (_) { /* never break the session */ }
});
