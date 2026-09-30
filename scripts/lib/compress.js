'use strict';

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;
const PROGRESS = /^\s*(?:\d{1,3}%|[#=>\-.\s]{8,}$|.*\b\d+(?:\.\d+)?\s?[kMG]?i?B\/s\b)/;
const IMPORTANT = /\b(error|fail(?:ed|ure|ing)?|exception|traceback|panic|fatal|denied|not found|cannot|unable|warning)\b|✗|✘|FAIL\b/i;

const DEFAULTS = { minChars: 1500, maxLines: 120, head: 40, tail: 60, maxImportant: 40, maxLineLen: 400, hint: 'Re-run with a narrower command or redirect to a file if you need them.' };

function compress(input, opts) {
  const o = Object.assign({}, DEFAULTS, opts);
  const before = input.length;
  if (before < o.minChars) return { text: input, before, after: before, changed: false };

  let lines = input.replace(ANSI, '').split('\n').map((l) => {
    l = l.replace(/\r+$/, ''); // CRLF: drop the line ending before looking for in-line \r overwrites
    const cr = l.lastIndexOf('\r');
    return (cr >= 0 ? l.slice(cr + 1) : l).replace(/\s+$/, '');
  });

  lines = lines.filter((l) => !PROGRESS.test(l) || IMPORTANT.test(l));

  const out = [];
  let prev = null;
  let run = 0;
  const flush = () => {
    if (prev === null) return;
    out.push(run > 1 ? `${prev} (x${run})` : prev);
  };
  for (const l of lines) {
    if (l === '' && prev === '') continue;
    if (l === prev) { run++; continue; }
    flush();
    prev = l;
    run = 1;
  }
  flush();
  lines = out.map((l) => (l.length > o.maxLineLen ? `${l.slice(0, o.maxLineLen)}...[+${l.length - o.maxLineLen} chars]` : l));

  if (lines.length > o.maxLines) {
    const head = lines.slice(0, o.head);
    const tail = lines.slice(lines.length - o.tail);
    const middle = lines.slice(o.head, lines.length - o.tail);
    const keep = middle.filter((l) => IMPORTANT.test(l)).slice(0, o.maxImportant);
    const omitted = middle.length - keep.length;
    lines = [...head, `[token-thrifty: ${omitted} lines omitted${keep.length ? `; ${keep.length} error/warning lines from the omitted section kept below` : ''}. ${o.hint}]`, ...keep, ...tail];
  }

  const text = lines.join('\n').replace(/\n+$/, '');
  const after = text.length;
  if (after > before * 0.85) return { text: input, before, after: before, changed: false };
  return { text, before, after, changed: true };
}

module.exports = { compress, DEFAULTS };
