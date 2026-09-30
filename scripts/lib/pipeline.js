'use strict';
const { compress, IMPORTANT, ANSI } = require('./compress');
const { collapsePassing, PASS } = require('./testrun');

const RESTORE_CAP = 30;
const clean = (l) => l.replace(ANSI, '').replace(/\r+$/, '').trim();

// Safeguard: after compression, every error/warning-looking line of the original must still be visible.
// Anything missing is appended (up to RESTORE_CAP); passing-test lines are deliberately hidden and ignored.
function recover(original, final, saved) {
  const have = new Set(final.split('\n').map(clean));
  const missing = [];
  const seen = new Set();
  for (const raw of original.split('\n')) {
    const l = clean(raw);
    if (!l || seen.has(l) || !IMPORTANT.test(l) || PASS.test(l)) continue;
    seen.add(l);
    if (!have.has(l) && !final.includes(l.slice(0, 300))) missing.push(l.length > 400 ? `${l.slice(0, 400)}...` : l);
  }
  if (!missing.length) return { text: final, restored: 0 };
  const shown = missing.slice(0, RESTORE_CAP);
  const more = missing.length - shown.length;
  const tail = `[token-thrifty: ${shown.length} error/warning line${shown.length > 1 ? 's' : ''} restored${more ? `; ${more} more not shown${saved ? ` (see ${saved})` : ''}` : ''}]`;
  return { text: `${final}\n${tail}\n${shown.join('\n')}`, restored: shown.length };
}

// Full compression pipeline used by the PostToolUse hook: test-run collapse, generic compression, safeguard.
// `spill(text)` should return a file path holding the untouched output (or null).
function run(text, spill) {
  const unchanged = { text, before: text.length, after: text.length, changed: false, restored: 0 };
  let work = text;
  let saved = null;

  if (collapsePassing(text).collapsed) {
    saved = spill ? spill(text) : null;
    work = collapsePassing(text, saved).text;
  }

  let r = compress(work);
  if (r.changed && r.text.includes('lines omitted')) {
    if (!saved && spill) saved = spill(text);
    if (saved) r = compress(work, { hint: `Full output saved to ${saved}; Grep it or Read it with offset/limit instead of re-running the command.` });
  }

  let final = r.changed ? r.text : work;
  if (final === text) return unchanged;
  const rec = recover(text, final, saved);
  final = rec.text;
  if (final.length > text.length * 0.85) return unchanged;
  return { text: final, before: text.length, after: final.length, changed: true, restored: rec.restored };
}

module.exports = { run, recover };
