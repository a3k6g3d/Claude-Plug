'use strict';
const { compress } = require('./compress');
const { collapsePassing } = require('./testrun');

// Full compression pipeline used by the PostToolUse hook: test-run collapse, then generic compression.
// `spill(text)` should return a file path holding the untouched output (or null).
function run(text, spill) {
  const unchanged = { text, before: text.length, after: text.length, changed: false };
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

  const final = r.changed ? r.text : work;
  if (final === text || final.length > text.length * 0.85) return unchanged;
  return { text: final, before: text.length, after: final.length, changed: true };
}

module.exports = { run };
