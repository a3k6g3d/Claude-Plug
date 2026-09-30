'use strict';
// Collapse runs of passing-test lines (vitest/jest verbose, node --test, TAP, pytest -v) into a count.
// Failures, headers, and summaries are never touched: only lines that positively look like a pass are collapsed.

const PASS = /^\s*(?:[✓✔√]|ok \d+\b|PASS(?:ED)?\b|\S*::\S+ PASSED|\S+\.\w+ (?:::)?.*\bPASSED\b)/;
// A pass-looking line that also contains failure words stays visible.
const FAILISH = /\b(fail(?:ed|ing|ure)?|error|exception|not ok|✗|✘|×|✖)\b|[✗✘×✖]/i;
const MIN_PASS_LINES = 8;

function collapsePassing(text, where) {
  const lines = text.split('\n');
  let passing = 0;
  for (const l of lines) if (PASS.test(l) && !FAILISH.test(l)) passing++;
  if (passing < MIN_PASS_LINES) return { text, collapsed: 0 };

  const out = [];
  let run = 0;
  let total = 0;
  const flush = () => {
    if (run > 0) out.push(`  [${run} passing test line${run > 1 ? 's' : ''} collapsed]`);
    total += run;
    run = 0;
  };
  for (const l of lines) {
    if (PASS.test(l) && !FAILISH.test(l)) run++;
    else { flush(); out.push(l); }
  }
  flush();
  if (where) out.push(`[token-thrifty: ${total} passing test lines collapsed; full output: ${where}]`);
  return { text: out.join('\n'), collapsed: total };
}

module.exports = { collapsePassing, PASS, FAILISH, MIN_PASS_LINES };
