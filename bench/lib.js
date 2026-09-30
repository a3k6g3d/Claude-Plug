'use strict';
// Pure helpers for the A/B benchmark: parse `claude -p --output-format stream-json` output and summarise runs.

function parseStream(stdout) {
  let init = null;
  let result = null;
  for (const line of String(stdout).split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch (_) { continue; }
    if (o.type === 'system' && o.subtype === 'init') init = o;
    else if (o.type === 'result') result = o;
  }
  return { init, result };
}

function tokensOf(result) {
  const u = (result && result.usage) || {};
  return {
    input: u.input_tokens || 0,
    output: u.output_tokens || 0,
    cacheWrite: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
  };
}

// One trial row from a parsed stream. `expect` (array of regex sources) is a cheap automatic answer check.
function toRow(meta, parsed, opts) {
  const { init, result } = parsed;
  const t = tokensOf(result);
  const text = (result && typeof result.result === 'string') ? result.result : '';
  const expect = (opts && opts.expect) || [];
  const plugins = init && Array.isArray(init.plugins) ? init.plugins.map((p) => (typeof p === 'string' ? p : p.name || p.id || JSON.stringify(p))) : null;
  return Object.assign({}, meta, {
    ok: !!result && !result.is_error,
    cost: result && typeof result.total_cost_usd === 'number' ? result.total_cost_usd : null,
    turns: result ? result.num_turns : null,
    ms: result ? result.duration_ms : null,
    tokens: t,
    totalTokens: t.input + t.output + t.cacheWrite + t.cacheRead,
    answerChars: text.length,
    passedExpect: expect.length ? expect.every((e) => new RegExp(e, 'i').test(text)) : null,
    plugins,
  });
}

// Does the plugin set that was actually loaded match what the arm intended?
function checkPlugins(row, arm) {
  const want = arm.expectPlugins || {};
  const problems = [];
  if (!Object.keys(want).length) return problems;
  if (!row.plugins) return ['init event did not list plugins; cannot verify arm'];
  for (const [name, on] of Object.entries(want)) {
    const has = row.plugins.some((p) => p.toLowerCase().includes(name.toLowerCase()));
    if (has !== on) problems.push(`${name} is ${has ? 'loaded' : 'not loaded'} but arm "${arm.name}" expects ${on ? 'loaded' : 'not loaded'}`);
  }
  return problems;
}

const median = (a) => {
  const s = a.slice().sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Small seeded PRNG so reports are reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function bootstrapMedianCI(values, iters, seed) {
  if (values.length < 2) return null;
  const r = rng(seed || 1);
  const meds = [];
  for (let i = 0; i < (iters || 2000); i++) {
    const s = [];
    for (let j = 0; j < values.length; j++) s.push(values[Math.floor(r() * values.length)]);
    meds.push(median(s));
  }
  meds.sort((a, b) => a - b);
  return [meds[Math.floor(meds.length * 0.025)], meds[Math.floor(meds.length * 0.975)]];
}

// Exact two-sided sign test p-value.
function signTest(deltas) {
  const nz = deltas.filter((d) => d !== 0);
  const n = nz.length;
  if (!n) return 1;
  const pos = nz.filter((d) => d > 0).length;
  const k = Math.min(pos, n - pos);
  let c = 1;
  let cdf = 0;
  for (let i = 0; i <= k; i++) { cdf += c; c = (c * (n - i)) / (i + 1); }
  return Math.min(1, (2 * cdf) / Math.pow(2, n));
}

// Pair each arm's trial with the baseline trial of the same task and repeat, then compare on a metric.
function compare(rows, baseArm, metric) {
  const key = (r) => `${r.task}#${r.rep}`;
  const base = new Map(rows.filter((r) => r.arm === baseArm && r.ok && r[metric] != null).map((r) => [key(r), r]));
  const arms = [...new Set(rows.map((r) => r.arm))].filter((a) => a !== baseArm);
  const out = {};
  for (const arm of arms) {
    const pairs = rows.filter((r) => r.arm === arm && r.ok && r[metric] != null && base.has(key(r)))
      .map((r) => ({ task: r.task, a: r[metric], b: base.get(key(r))[metric] }))
      .filter((p) => p.b > 0);
    const logs = pairs.map((p) => Math.log(p.a / p.b));
    const pct = pairs.map((p) => (p.a / p.b - 1) * 100);
    const ci = bootstrapMedianCI(pct, 2000, 7);
    out[arm] = {
      pairs: pairs.length,
      medianDeltaPct: median(pct),
      ci95: ci,
      meanDeltaPct: pairs.length ? (Math.exp(logs.reduce((s, x) => s + x, 0) / logs.length) - 1) * 100 : null,
      signP: signTest(pct),
      worseCount: pct.filter((x) => x > 0).length,
    };
  }
  return out;
}

module.exports = { parseStream, toRow, checkPlugins, compare, median, signTest, bootstrapMedianCI, tokensOf };

// A fair A/B needs arms that differ ONLY by the plugin under test. Compare the plugin sets that actually loaded.
function armSetProblems(rows, baseArm) {
  const problems = [];
  const sets = {};
  for (const r of rows) {
    if (!r.plugins) continue;
    (sets[r.arm] = sets[r.arm] || new Set()).add(JSON.stringify(r.plugins.slice().sort()));
  }
  for (const [arm, s] of Object.entries(sets)) {
    if (s.size > 1) problems.push(`arm "${arm}" loaded different plugin sets in different trials (${[...s].map((x) => JSON.parse(x).join('+')).join(' | ')})`);
  }
  const sample = (arm) => { const rr = rows.find((r) => r.arm === arm && r.plugins); return rr ? { plugins: rr.plugins, expect: Object.keys(rr.expectPlugins || {}) } : null; };
  const base = sample(baseArm);
  if (base) {
    for (const arm of Object.keys(sets)) {
      if (arm === baseArm) continue;
      const cur = sample(arm);
      const allowed = new Set([...base.expect, ...cur.expect].map((x) => x.toLowerCase()));
      const a = new Set(base.plugins);
      const b = new Set(cur.plugins);
      const diff = [...a].filter((x) => !b.has(x)).concat([...b].filter((x) => !a.has(x)))
        .filter((x) => ![...allowed].some((al) => x.toLowerCase().includes(al)));
      if (diff.length) problems.push(`arms "${baseArm}" and "${arm}" differ by more than the plugin under test: ${diff.join(', ')}`);
    }
  }
  return problems;
}

module.exports.armSetProblems = armSetProblems;
