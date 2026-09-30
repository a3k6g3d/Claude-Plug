'use strict';
// A/B benchmark runner: the same read-only tasks, run headless through `claude -p`, once per arm
// (e.g. baseline vs token-thrifty vs another plugin). Records real cost, tokens, and turns.
//
//   node bench/run.js --repo I:\some\project --dry-run          # show the plan and worst-case cost
//   node bench/run.js --repo I:\some\project --reps 3 --yes     # actually spend money
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseStream, toRow, checkPlugins } = require('./lib');

const WARMUP_PROMPT = 'Reply with the single word: ready';

function parseArgs(argv) {
  const a = { reps: 3, model: 'sonnet', budget: 1.0, yes: false, dry: false, timeout: 15, warmup: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--yes') a.yes = true;
    else if (k === '--dry-run') a.dry = true;
    else if (k === '--no-warmup') a.warmup = false;
    else if (k.startsWith('--')) a[k.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  a.reps = Number(a.reps);
  a.budget = Number(a.budget);
  a.timeout = Number(a.timeout);
  return a;
}

function shuffle(arr, seed) {
  let s = seed >>> 0;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function plan(tasks, arms, reps, only) {
  const use = only ? tasks.filter((t) => only.includes(t.id)) : tasks;
  const trials = [];
  for (let rep = 1; rep <= reps; rep++) {
    for (const task of use) {
      // Interleave and randomise arm order per (task, rep) so drift and caching don't favour one arm.
      for (const arm of shuffle(arms, rep * 1000 + task.id.length * 31 + task.id.charCodeAt(0))) trials.push({ task, arm, rep });
    }
  }
  return trials;
}

const countLines = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length; } catch (_) { return 0; } };

// Run one trial through `claude -p`. Exits the process on an authentication failure (nothing is billed then).
function runTrial(ctx, t, prompt, warmup) {
  const a = ctx.a;
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', a.model,
    '--max-budget-usd', String(a.budget), '--no-session-persistence',
    '--permission-mode', 'dontAsk',
    '--allowedTools', warmup ? 'Read' : 'Bash,PowerShell,Read,Grep,Glob',
    '--disallowedTools', 'Edit,Write,NotebookEdit,WebFetch,WebSearch',
    '--settings', JSON.stringify(t.arm.settings || {}), ...(t.arm.args || [])];
  const before = countLines(ctx.statsFile);
  const started = Date.now();
  const p = spawnSync(ctx.claude, args, { cwd: a.repo, input: prompt, encoding: 'utf8', timeout: a.timeout * 60000, maxBuffer: 256 * 1024 * 1024 });
  const parsed = parseStream(p.stdout || '');
  const row = toRow({ task: t.task.id, arm: t.arm.name, rep: t.rep, warmup: !!warmup, wallMs: Date.now() - started, compressions: countLines(ctx.statsFile) - before }, parsed, { expect: t.task.expect });
  row.expectPlugins = t.arm.expectPlugins || {};
  row.problems = checkPlugins(row, t.arm);
  if (!parsed.result) row.error = (p.stderr || p.error || 'no result event').toString().slice(0, 300);
  else if (!row.ok) row.error = String(parsed.result.result || parsed.result.terminal_reason || 'error').slice(0, 300);
  if (!row.ok && /not logged in|authentication|api key|\/login/i.test(row.error || '')) {
    console.error(`\nAborting: claude -p is not authenticated (${row.error}).\nSign in first with: claude auth login\nNothing was recorded for this trial and nothing was billed.`);
    process.exit(3);
  }
  fs.appendFileSync(ctx.file, JSON.stringify(row) + '\n');
  if (!warmup) fs.writeFileSync(path.join(ctx.out, `${t.task.id}.${t.arm.name}.${t.rep}.txt`), (parsed.result && parsed.result.result) || '');
  return row;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.repo) { console.error('Usage: node bench/run.js --repo <project dir> [--reps 3] [--model sonnet] [--budget 1.0] [--no-warmup] [--dry-run | --yes]'); process.exit(2); }
  const dir = __dirname;
  const tasks = JSON.parse(fs.readFileSync(a.tasks || path.join(dir, 'tasks.json'), 'utf8'));
  const armsCfg = JSON.parse(fs.readFileSync(a.arms || path.join(dir, 'arms.json'), 'utf8'));
  const arms = Object.entries(armsCfg).map(([name, v]) => Object.assign({ name }, v));
  const out = a.out || path.join(dir, 'results');
  const file = path.join(out, 'results.jsonl');
  const claude = a.claude || path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude');
  const statsFile = a.statsFile || path.join(os.homedir(), '.claude', 'plugins', 'data', 'token-thrifty-claude-plug', 'stats.jsonl');
  const ctx = { a, out, file, claude, statsFile };

  const trials = plan(tasks, arms, a.reps, a.only && a.only.split(','));
  const done = new Set();
  try { for (const l of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); done.add(`${r.task}|${r.arm}|${r.rep}|${r.warmup ? 'w' : ''}`); } } catch (_) { /* fresh run */ }
  const todo = trials.filter((t) => !done.has(`${t.task.id}|${t.arm.name}|${t.rep}|`));
  const warmups = a.warmup && todo.length ? arms.filter((x) => !done.has(`__warmup|${x.name}|0|w`)) : [];

  console.log(`Repo: ${a.repo}\nModel: ${a.model}   Arms: ${arms.map((x) => x.name).join(', ')}   Tasks: ${new Set(trials.map((t) => t.task.id)).size}   Reps: ${a.reps}`);
  console.log(`Trials to run: ${todo.length} (${trials.length - todo.length} already done) + ${warmups.length} warm-up run(s) that are recorded but not counted`);
  console.log(`Worst-case spend: $${((todo.length + warmups.length) * a.budget).toFixed(2)} (${todo.length + warmups.length} runs x $${a.budget} per-run cap). Typical is well below the cap.`);
  if (a.dry || !a.yes) {
    for (const t of todo.slice(0, 12)) console.log(`  rep ${t.rep}  ${t.task.id.padEnd(14)} ${t.arm.name}`);
    if (todo.length > 12) console.log(`  ... ${todo.length - 12} more`);
    console.log(a.dry ? '\nDry run only; nothing was executed.' : '\nNothing executed. Re-run with --yes to spend the money above.');
    return;
  }

  fs.mkdirSync(out, { recursive: true });
  // Warm-up: each arm has its own prompt-cache prefix, and the first run per prefix pays to write it.
  // Without this the arm that happens to run first looks more expensive.
  for (const arm of warmups) {
    const row = runTrial(ctx, { task: { id: '__warmup' }, arm, rep: 0 }, WARMUP_PROMPT, true);
    console.log(`[warm-up] ${arm.name}: ${row.ok ? `$${(row.cost || 0).toFixed(3)}` : `FAILED ${row.error || ''}`}${row.problems.length ? `  !! ${row.problems.join('; ')}` : ''}`);
  }

  let n = 0;
  for (const t of todo) {
    n++;
    const row = runTrial(ctx, t, t.task.prompt, false);
    console.log(`[${n}/${todo.length}] ${t.task.id} / ${t.arm.name} / rep ${t.rep}: ${row.ok ? `$${(row.cost || 0).toFixed(3)}, ${row.turns} turns, ${row.compressions} compressions` : `FAILED ${row.error || ''}`}${row.problems.length ? `  !! ${row.problems.join('; ')}` : ''}`);
  }
  console.log(`\nDone. Run: node bench/report.js ${out !== path.join(dir, 'results') ? `--out ${out}` : ''}`);
}

if (require.main === module) main();
module.exports = { plan, parseArgs };
