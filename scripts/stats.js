'use strict';
const { summarize, file } = require('./lib/stats');
const s = summarize();
const tok = (c) => Math.round(c / 4).toLocaleString();
if (!s.calls) { console.log(`No savings recorded yet (${file()}).`); process.exit(0); }
console.log(`token-thrifty: ${s.calls} outputs compressed`);
console.log(`~${tok(s.before - s.after)} tokens saved (${tok(s.before)} -> ${tok(s.after)}, ${Math.round((1 - s.after / s.before) * 100)}% smaller). Estimate: chars/4.`);
for (const [t, b] of Object.entries(s.by)) console.log(`  ${t}: ${b.calls} calls, ~${tok(b.before - b.after)} tokens saved`);
