'use strict';
const { IMPORTANT, ANSI } = require('./compress');

// Cross-call dedup: if a new command output mostly repeats lines the model already saw in a recent
// output, show only the lines that are new (plus every error/warning line, plus what disappeared).
// Lossless as long as the earlier output is still in context; the caller resets state on compact/clear.

const MIN_CHARS = 800;       // smaller outputs are not worth the marker
const MIN_OVERLAP = 0.6;     // share of this output's lines already seen (same command re-run)
const MIN_OVERLAP_OTHER = 0.95; // ...for a different command
const KEEP_OUTPUTS = 8;      // how many earlier outputs to remember
const MAX_LINES = 1500;      // per remembered output

const clean = (l) => l.replace(ANSI, '').replace(/\r+$/, '').replace(/\s+$/, '');

function hash(s) { // FNV-1a, 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const norm = (c) => String(c || '').replace(/\s+/g, ' ').trim();
const sameCmd = (a, b) => norm(a).slice(0, 60) === norm(b).slice(0, 60);
const linesOf = (text) => text.split('\n').map(clean).filter((l) => l.trim());

// `mem` is the persisted list ([{ n, cmd, h: [hashes] }]); returns { text|null, mem }.
function dedup(text, cmd, mem) {
  const list = Array.isArray(mem) ? mem : [];
  const lines = linesOf(text);
  if (text.length < MIN_CHARS || lines.length < 8) return { text: null, mem: list };

  const hs = lines.map(hash);
  const n = (list.length ? list[list.length - 1].n : 0) + 1;
  const remember = () => list.concat([{ n, cmd: String(cmd || '').replace(/\s+/g, ' ').slice(0, 80), h: hs.slice(0, MAX_LINES) }]).slice(-KEEP_OUTPUTS);

  let best = null;
  for (const prev of list) {
    const set = new Set(prev.h);
    let common = 0;
    for (const h of hs) if (set.has(h)) common++;
    const overlap = common / hs.length;
    // Same command re-run: a moderate overlap is enough. A different command must match almost entirely.
    const need = sameCmd(prev.cmd, cmd) ? MIN_OVERLAP : MIN_OVERLAP_OTHER;
    if (overlap >= need && (!best || overlap > best.overlap)) best = { prev, set, overlap };
  }
  if (!best) return { text: null, mem: remember() };

  const cur = new Set(hs);
  const fresh = [];
  let same = 0;
  lines.forEach((l, i) => {
    if (!best.set.has(hs[i]) || IMPORTANT.test(l)) fresh.push(l); else same++;
  });
  const gone = best.prev.h.filter((h) => !cur.has(h)).length;
  const ref = `call #${best.prev.n}${best.prev.cmd ? ` (\`${best.prev.cmd.slice(0, 50)}\`)` : ''}`;

  if (same < 4) return { text: null, mem: remember() };
  const head = fresh.length
    ? `[token-thrifty: ${same} of ${lines.length} lines are identical to the output of ${ref}; showing only the other lines${gone ? `, and ${gone} line${gone > 1 ? 's' : ''} from that output no longer appear` : ''}.]`
    : `[token-thrifty: identical to the output of ${ref}${gone ? `, except ${gone} line${gone > 1 ? 's' : ''} no longer appear` : ''}.]`;
  return { text: fresh.length ? `${head}\n${fresh.join('\n')}` : head, mem: remember() };
}

module.exports = { dedup, hash, MIN_CHARS, MIN_OVERLAP };
