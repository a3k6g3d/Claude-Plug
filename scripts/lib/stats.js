'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

function dir() {
  return process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.claude', 'token-thrifty');
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
