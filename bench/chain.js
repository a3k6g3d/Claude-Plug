'use strict';
// Does compacting (or clearing) between unrelated tasks lower real cost?
// Runs the same tasks back to back in one session under three policies and sums the real cost:
//   plain   - one session, nothing in between (context keeps growing)
//   compact - one session, `/compact` after each task
//   fresh   - a new session per task (what /clear gives you)
//
//   node bench/chain.js --repo I:\proj --probe        # cheap check that /compact works in headless mode
//   node bench/chain.js --repo I:\proj --dry-run
//   node bench/chain.js --repo I:\proj --reps 3 --yes
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { parseStream, tokensOf, median } = require('./lib');

const POLICIES = ['plain', 'compact', 'fresh'];

function argv() {
  const a = process.argv.slice(2);
  const get = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  return { a, get, has: (k) => a.includes(k) };
}

function makeTurn(o) {
  return function turn(prompt, sessionId, first) {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', o.model, '--max-budget-usd', o.budget,
      '--permission-mode', 'dontAsk', '--allowedTools', 'Bash,PowerShell,Read,Grep,Glob',
      '--disallowedTools', 'Edit,Write,NotebookEdit,WebFetch,WebSearch',
      '--settings', JSON.stringify({ enabledPlugins: { 'token-thrifty@claude-plug': false } }),
      ...(first ? ['--session-id', sessionId] : ['--resume', sessionId])];
    const p = spawnSync(o.claude, args, { cwd: o.repo, input: prompt, encoding: 'utf8', timeout: 12 * 60000, maxBuffer: 256 * 1024 * 1024 });
    const { result } = parseStream(p.stdout || '');
    const t = tokensOf(result);
    return {
      ok: !!result && !result.is_error,
      cost: result && typeof result.total_cost_usd === 'number' ? result.total_cost_usd : 0,
      turns: result ? result.num_turns : 0,
      text: String((result && result.result) || p.stderr || '').slice(0, 300),
      tokens: t.input + t.output + t.cacheWrite + t.cacheRead,
    };
  };
}

function runChain(turn, policy, tasks) {
  const rows = [];
  let id = crypto.randomUUID();
  tasks.forEach((t, i) => {
    if (policy === 'fresh' && i > 0) id = crypto.randomUUID();
    const first = policy === 'fresh' || i === 0;
    const r = turn(t.prompt, id, first);
    rows.push({ step: t.id, kind: 'task', ...r });
    if (policy === 'compact' && i < tasks.length - 1) rows.push({ step: t.id, kind: 'compact', ...turn('/compact', id, false) });
  });
  return rows;
}

function main() {
  const { get, has } = argv();
  const o = {
    repo: get('--repo', process.cwd()), model: get('--model', 'sonnet'), budget: get('--budget', '1.0'),
    claude: get('--claude', path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude')),
  };
  const reps = Number(get('--reps', 3));
  const tasks = JSON.parse(fs.readFileSync(get('--tasks', path.join(__dirname, 'tasks.explore.json')), 'utf8')).slice(0, Number(get('--steps', 3)));
  const turn = makeTurn(o);

  if (has('--probe')) {
    const id = crypto.randomUUID();
    const r1 = turn('Reply with the single word: one', id, true);
    const r2 = turn('/compact', id, false);
    const r3 = turn('Reply with the single word: two', id, false);
    console.log(JSON.stringify({ r1, compact: r2, r3 }, null, 2));
    return;
  }
  console.log(`Repo: ${o.repo}  Steps: ${tasks.map((t) => t.id).join(' -> ')}  Policies: ${POLICIES.join(', ')}  Reps: ${reps}`);
  console.log(`Worst-case spend: $${(reps * POLICIES.length * (tasks.length * 2) * Number(o.budget)).toFixed(2)} (per-call cap $${o.budget}); typical is a few dollars.`);
  if (has('--dry-run') || !has('--yes')) { console.log(has('--dry-run') ? '\nDry run only.' : '\nNothing executed. Re-run with --yes.'); return; }

  const out = get('--out', path.join(__dirname, 'results-chain'));
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, 'chains.jsonl');
  for (let rep = 1; rep <= reps; rep++) {
    for (const policy of POLICIES.slice().sort(() => ((rep * 7919) % 3) - 1)) {
      const rows = runChain(turn, policy, tasks);
      const total = rows.reduce((s, r) => s + r.cost, 0);
      const ok = rows.every((r) => r.ok);
      fs.appendFileSync(file, JSON.stringify({ rep, policy, ok, total, rows }) + '\n');
      console.log(`rep ${rep} ${policy.padEnd(8)} total $${total.toFixed(3)}  per-step ${rows.map((r) => `${r.kind[0]}:$${r.cost.toFixed(2)}`).join(' ')}${ok ? '' : '  !! a step failed'}`);
    }
  }
  report(file);
}

function report(file) {
  const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.ok);
  console.log('\npolicy    chains  median total $   (each chain = the same tasks back to back)');
  for (const p of POLICIES) {
    const r = rows.filter((x) => x.policy === p);
    console.log(p.padEnd(9) + String(r.length).padStart(6) + (r.length ? `   $${median(r.map((x) => x.total)).toFixed(3)}` : '   n/a'));
  }
}

if (require.main === module) main();
module.exports = { runChain, POLICIES };
