'use strict';
const fs = require('fs');
const path = require('path');
const { compare, median, armSetProblems } = require('./lib');

function load(file) {
  try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (_) { return []; }
}

const fmt = (x, d) => (x == null ? 'n/a' : x.toFixed(d == null ? 2 : d));
const sign = (x) => (x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(1)}%`);

function report(allRows, baseArm) {
  const rows = allRows.filter((r) => !r.warmup);
  const lines = [];
  const arms = [...new Set(rows.map((r) => r.arm))];
  if (!rows.length) return 'No results yet.';
  const base = arms.includes(baseArm) ? baseArm : arms[0];
  lines.push(`Trials: ${rows.length}   Arms: ${arms.join(', ')}   Baseline: ${base}`);
  lines.push('');
  lines.push('arm'.padEnd(18) + 'ok'.padStart(6) + 'med $'.padStart(9) + 'med tokens'.padStart(13) + 'med turns'.padStart(11) + 'answers ok'.padStart(12) + 'compressions'.padStart(14));
  for (const arm of arms) {
    const r = rows.filter((x) => x.arm === arm);
    const ok = r.filter((x) => x.ok);
    const exp = r.filter((x) => x.passedExpect !== null && x.passedExpect !== undefined);
    lines.push(arm.padEnd(18) + `${ok.length}/${r.length}`.padStart(6) + fmt(median(ok.map((x) => x.cost)), 3).padStart(9) + String(Math.round(median(ok.map((x) => x.totalTokens)) || 0)).padStart(13)
      + fmt(median(ok.map((x) => x.turns)), 1).padStart(11) + (exp.length ? `${exp.filter((x) => x.passedExpect).length}/${exp.length}` : 'n/a').padStart(12) + String(r.reduce((s, x) => s + (x.compressions || 0), 0)).padStart(14));
  }
  const setProblems = armSetProblems(rows, base);
  if (setProblems.length) {
    lines.push('', 'WARNING: the arms are not comparable, so the deltas below are NOT trustworthy:');
    for (const p of setProblems) lines.push(`  - ${p}`);
  }
  const bad = rows.filter((r) => r.problems && r.problems.length);
  if (bad.length) {
    lines.push('', `WARNING: ${bad.length} trial(s) did not run the intended plugin set, so the comparison may be invalid:`);
    for (const p of [...new Set(bad.flatMap((r) => r.problems))].slice(0, 4)) lines.push(`  - ${p}`);
  }
  for (const metric of [['cost', 'Cost (USD)'], ['totalTokens', 'Total tokens (incl. cache reads)'], ['turns', 'Turns']]) {
    const cmp = compare(rows, base, metric[0]);
    lines.push('', `${metric[1]} vs ${base} (paired by task and repeat; negative = cheaper):`);
    for (const [arm, c] of Object.entries(cmp)) {
      const verdict = !c.ci95 ? 'too few pairs' : (c.ci95[0] > 0 ? 'WORSE (significant)' : c.ci95[1] < 0 ? 'BETTER (significant)' : 'no detectable difference');
      lines.push(`  ${arm.padEnd(16)} median ${sign(c.medianDeltaPct)}  95% CI [${c.ci95 ? `${sign(c.ci95[0])}, ${sign(c.ci95[1])}` : 'n/a'}]  geo-mean ${sign(c.meanDeltaPct)}  pairs ${c.pairs}  costlier in ${c.worseCount}/${c.pairs}  sign-test p=${fmt(c.signP, 3)}  -> ${verdict}`);
    }
  }
  lines.push('', 'Read this as: a saving only counts if cost drops AND answers stay correct (compare the saved answers in the results folder).');
  return lines.join('\n');
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const out = get('--out') || path.join(__dirname, 'results');
  console.log(report(load(path.join(out, 'results.jsonl')), get('--baseline') || 'baseline'));
}

module.exports = { report };
