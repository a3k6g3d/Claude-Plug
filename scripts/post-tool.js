'use strict';
const { run } = require('./lib/pipeline');
const { dedup, hash } = require('./lib/dedup');
const { record } = require('./lib/stats');
const { spill } = require('./lib/spill');
const state = require('./lib/state');

const MAX_SIGS = 30;

function textOf(resp) {
  if (typeof resp === 'string') return resp;
  if (resp && typeof resp === 'object') {
    const parts = [resp.stdout, resp.stderr, resp.output, resp.content].filter((p) => typeof p === 'string' && p);
    if (parts.length) return parts.join('\n');
  }
  return null;
}

// Identity of a command for the backfire guard: directory prefix and whitespace don't matter.
const sigOf = (cmd) => String(cmd || '').replace(/^\s*(cd\s+("[^"]*"|\S+)\s*(&&|;)\s*)+/, '').replace(/\s+/g, ' ').trim().slice(0, 200);

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  try {
    if ((process.env.TOKEN_THRIFTY || '').toLowerCase() === 'off') return;
    const ev = JSON.parse(raw);
    const text = textOf(ev.tool_response);
    if (text === null) return;

    const shell = /^(Bash|PowerShell)$/.test(ev.tool_name);
    const cmd = (ev.tool_input || {}).command;
    const s = shell ? state.load(ev.session_id, 'out') : {};
    s.lossy = s.lossy || {};        // sig -> hash of the raw output we trimmed last time
    s.lossless = s.lossless || [];  // sigs where trimming proved counter-productive

    // Backfire guard: the same command, re-run, giving the same raw output right after we trimmed it, means the
    // model came back for what we cut. Give it everything this time and stop trimming that command.
    const sig = shell ? sigOf(cmd) : '';
    const guard = shell && !!sig;   // no command text, no identity to compare
    const rawHash = shell ? hash(text) : 0;
    let lossless = guard && s.lossless.includes(sig);
    if (guard && !lossless && s.lossy[sig] === rawHash) {
      lossless = true;
      s.lossless = s.lossless.concat(sig).slice(-MAX_SIGS);
      delete s.lossy[sig];
      record({ tool: 'backfire', before: 0, after: 0 });
    }

    const r = run(text, (t) => spill(t, ev.session_id), cmd, { lossless });
    let out = r.changed ? r.text : text;
    if (guard && r.omitted) {
      s.lossy[sig] = rawHash;
      const keys = Object.keys(s.lossy);
      if (keys.length > MAX_SIGS) delete s.lossy[keys[0]];
    }

    // Cross-call dedup for shell output: skip lines the model already saw in a recent call.
    if (shell) {
      const d = dedup(out, cmd, s.calls);
      s.calls = d.mem;
      if (d.text !== null && d.text.length < out.length * 0.85) out = d.text;
      state.save(ev.session_id, s, 'out');
    }

    if (out === text) return;
    record({ tool: ev.tool_name, before: text.length, after: out.length });
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: out },
    }));
  } catch (_) { /* never break the session */ }
});
