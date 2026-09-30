'use strict';
const { compress, IMPORTANT, ANSI } = require('./compress');
const { collapsePassing, PASS } = require('./testrun');

const RESTORE_CAP = 30;

// Deliberate file reads (sed -n, cat, head, tail, Get-Content on a file) are lines the model asked for,
// so they get a much higher line cap than ordinary command output.
const FILE_READ = /^(sed -n|cat( -n)?\s+[^|]*\.\w+|head( -n?\s*\d+)?\s+\S+\.\w+|tail( -n?\s*\d+)?\s+\S+\.\w+|Get-Content|type\s+\S+\.\w+|nl\s)/;
const FILE_READ_OPTS = { maxLines: 300, head: 100, tail: 150 };
function isFileRead(cmd) {
  const c = String(cmd || '').replace(/^\s*(cd\s+("[^"]*"|\S+)\s*(&&|;)\s*)+/, '').replace(/^(\w+=\S+\s+)+/, '');
  return FILE_READ.test(c);
}

// Data-style commands (git log/diff/show, grep, find, ls, wc, awk ...) return rows the model will count, sum
// or scan. Cutting their middle made it re-run the command to verify (seen in the A/B benchmark), so they
// only get a high cap. Build/test/install logs keep the ordinary cap: there only the failures matter.
const DATA_CMD = /^(git\s+(log|diff|show|blame|ls-files|grep|shortlog|branch|tag)\b|grep\b|rg\b|ag\b|find\b|fd\b|ls\b|dir\b|tree\b|wc\b|sort\b|uniq\b|awk\b|jq\b|diff\b|Get-ChildItem|Select-String|Measure-Object)/;
const DATA_OPTS = { maxLines: 800, head: 300, tail: 400 };
function isDataCommand(cmd) {
  const c = String(cmd || '').replace(/^\s*(cd\s+("[^"]*"|\S+)\s*(&&|;)\s*)+/, '').replace(/^(\w+=\S+\s+)+/, '');
  return DATA_CMD.test(c);
}
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
function run(text, spill, cmd, opts) {
  // `lossless`: never drop the middle of the output (used once trimming this command proved counter-productive).
  const base = (opts && opts.lossless) ? { maxLines: 1e9 } : isFileRead(cmd) ? FILE_READ_OPTS : ((opts && opts.data) || isDataCommand(cmd)) ? DATA_OPTS : {};
  const unchanged = { text, before: text.length, after: text.length, changed: false, restored: 0 };
  let work = text;
  let saved = null;

  if (collapsePassing(text).collapsed) {
    saved = spill ? spill(text) : null;
    work = collapsePassing(text, saved).text;
  }

  let r = compress(work, base);
  if (r.changed && r.text.includes('lines omitted')) {
    if (!saved && spill) saved = spill(text);
    if (saved) r = compress(work, { ...base, hint: `Full output saved to ${saved}; Grep it or Read it with offset/limit instead of re-running the command.` });
  }

  let final = r.changed ? r.text : work;
  if (final === text) return unchanged;
  const rec = recover(text, final, saved);
  final = rec.text;
  if (final.length > text.length * 0.85) return unchanged;
  return { text: final, before: text.length, after: final.length, changed: true, restored: rec.restored, omitted: final.includes('lines omitted') };
}

module.exports = { run, recover, isFileRead, isDataCommand };
