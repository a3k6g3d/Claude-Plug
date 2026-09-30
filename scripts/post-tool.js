'use strict';
const { run } = require('./lib/pipeline');
const { dedup } = require('./lib/dedup');
const { record } = require('./lib/stats');
const { spill } = require('./lib/spill');
const state = require('./lib/state');

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

    const r = run(text, (t) => spill(t, ev.session_id), (ev.tool_input || {}).command);
    let out = r.changed ? r.text : text;

    // Cross-call dedup for shell output: skip lines the model already saw in a recent call.
    if (/^(Bash|PowerShell)$/.test(ev.tool_name)) {
      const s = state.load(ev.session_id, 'out');
      const d = dedup(out, (ev.tool_input || {}).command, s.calls);
      s.calls = d.mem;
      state.save(ev.session_id, s, 'out');
      if (d.text !== null && d.text.length < out.length * 0.85) out = d.text;
    }

    if (out === text) return;
    record({ tool: ev.tool_name, before: text.length, after: out.length });
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: out },
    }));
  } catch (_) { /* never break the session */ }
});
