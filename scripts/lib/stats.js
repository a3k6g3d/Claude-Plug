'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

// Hooks get CLAUDE_PLUGIN_DATA, but commands run via Bash do not. When installed, this
// script lives at .../plugins/cache/<marketplace>/<plugin>/<version>/scripts/lib, and the
// data dir is .../plugins/data/<plugin>-<marketplace>; derive it so both sides agree.
function derived() {
  const parts = __dirname.split(path.sep);
  const i = parts.lastIndexOf('cache');
  if (i < 1 || parts[i - 1] !== 'plugins' || parts.length < i + 3) return null;
  return path.join(parts.slice(0, i).join(path.sep) || path.sep, 'data', `${parts[i + 2]}-${parts[i + 1]}`);
}
function dir() {
  return process.env.CLAUDE_PLUGIN_DATA || derived() || path.join(os.homedir(), '.claude', 'token-thrifty');
}
function file() { return path.join(dir(), 'stats.jsonl'); }

function record(entry) {
  try {
    fs.mkdirSync(dir(), { recursive: true });
    fs.appendFileSync(file(), JSON.stringify(Object.assign({ ts: new Date().toISOString() }, entry)) + '\n');
  } catch (_) { /* stats are best-effort */ }
}

function summarize() {
  let rows = [];
  try {
    rows = fs.readFileSync(file(), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch (_) { /* no data yet */ }
  const by = {};
  let before = 0;
  let after = 0;
  for (const r of rows) {
    const b = (by[r.tool] = by[r.tool] || { calls: 0, before: 0, after: 0 });
    b.calls++; b.before += r.before; b.after += r.after;
    before += r.before; after += r.after;
  }
  return { calls: rows.length, before, after, by };
}

module.exports = { record, summarize, file };
