'use strict';
const { summarize, file } = require('./lib/stats');
const s = summarize();
const tok = (c) => Math.round(c / 4).toLocaleString();
// "backfire" rows are not compressions: a command re-run with identical output right after we trimmed it.
const backfires = (s.by.backfire || {}).calls || 0;
delete s.by.backfire;
const calls = s.calls - backfires;
if (!calls && !backfires) { console.log(`No savings recorded yet (${file()}).`); process.exit(0); }
console.log(`token-thrifty: ${calls} outputs compressed`);
if (s.before) console.log(`~${tok(s.before - s.after)} tokens saved (${tok(s.before)} -> ${tok(s.after)}, ${Math.round((1 - s.after / s.before) * 100)}% smaller). Estimate: chars/4, not a measured bill.`);
for (const [t, b] of Object.entries(s.by)) console.log(`  ${t}: ${b.calls} calls, ~${tok(b.before - b.after)} tokens saved`);
if (backfires) console.log(`possible backfires: ${backfires} (a command was re-run with identical output right after trimming; trimming is now off for it in that session)`);
