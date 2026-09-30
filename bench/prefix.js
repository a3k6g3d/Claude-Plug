'use strict';
// Startup-context experiment: how many prompt tokens does each configuration cost before you type anything?
// Runs one trivial prompt per configuration and reads the real token usage. Costs a few cents per config.
//
//   node bench/prefix.js --dry-run     # list configurations, run nothing
//   node bench/prefix.js --yes         # run them
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseStream, tokensOf } = require('./lib');

const OFF = { 'token-thrifty@claude-plug': false };
const SYNCED_OFF = { 'cowork-plugin-management@synced': false, 'pdf-viewer@synced': false };

const CONFIGS = [
  { name: 'default', settings: { enabledPlugins: OFF }, args: [] },
  { name: 'no-skills', settings: { enabledPlugins: OFF }, args: ['--disable-slash-commands'] },
  { name: 'no-synced-plugins', settings: { enabledPlugins: { ...OFF, ...SYNCED_OFF } }, args: [] },
  { name: 'no-mcp', settings: { enabledPlugins: OFF }, args: ['--strict-mcp-config'] },
  { name: 'few-tools', settings: { enabledPlugins: OFF }, args: ['--tools', 'Bash,Read,Grep'] },
  { name: 'core6-only-tools', settings: { enabledPlugins: OFF }, args: ['--tools', 'Bash,Read,Grep,Glob,Edit,Write'] },
  { name: 'core6-lean', settings: { enabledPlugins: { ...OFF, ...SYNCED_OFF } }, args: ['--strict-mcp-config', '--tools', 'Bash,Read,Grep,Glob,Edit,Write'] },
  { name: 'core6-lean-noskills', settings: { enabledPlugins: { ...OFF, ...SYNCED_OFF } }, args: ['--disable-slash-commands', '--strict-mcp-config', '--tools', 'Bash,Read,Grep,Glob,Edit,Write'] },
  { name: 'all-of-the-above', settings: { enabledPlugins: { ...OFF, ...SYNCED_OFF } }, args: ['--disable-slash-commands', '--strict-mcp-config', '--tools', 'Bash,Read,Grep'] },
];

function main() {
  const argv = process.argv.slice(2);
  const get = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const only = get('--only', '');
  const list = only ? CONFIGS.filter((c) => only.split(',').includes(c.name) || c.name === 'default') : CONFIGS;
  const model = get('--model', 'sonnet');
  const budget = get('--budget', '0.5');
  const repo = get('--repo', process.cwd());
  const claude = get('--claude', path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude'));
  console.log(`Configurations: ${list.map((c) => c.name).join(', ')}\nWorst-case spend: $${(list.length * Number(budget)).toFixed(2)} (${list.length} runs x $${budget} cap); typical is about $0.07-0.25 per run.`);
  if (argv.includes('--dry-run') || !argv.includes('--yes')) { console.log(argv.includes('--dry-run') ? '\nDry run only.' : '\nNothing executed. Re-run with --yes.'); return; }

  const rows = [];
  for (const c of list) {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', model, '--max-budget-usd', budget,
      '--no-session-persistence', '--permission-mode', 'dontAsk', '--settings', JSON.stringify(c.settings), ...c.args];
    const p = spawnSync(claude, args, { cwd: repo, input: 'Reply with the single word: ready', encoding: 'utf8', timeout: 5 * 60000, maxBuffer: 64 * 1024 * 1024 });
    const { init, result } = parseStream(p.stdout || '');
    if (!result || result.is_error) {
      console.error(`${c.name}: FAILED ${String((result && result.result) || p.stderr || 'no result').slice(0, 200)}`);
      if (/not logged in|\/login/i.test(String(result && result.result))) process.exit(3);
      continue;
    }
    const t = tokensOf(result);
    rows.push({ name: c.name, prompt: t.input + t.cacheWrite + t.cacheRead, cost: result.total_cost_usd, tools: init && init.tools ? init.tools.length : null, skills: init && init.skills ? init.skills.length : null, plugins: init && init.plugins ? init.plugins.length : null });
  }
  const base = rows.find((r) => r.name === 'default');
  console.log('\nconfig'.padEnd(20) + 'prompt tokens'.padStart(15) + 'vs default'.padStart(12) + 'tools'.padStart(7) + 'skills'.padStart(8) + 'plugins'.padStart(9) + 'cost'.padStart(9));
  for (const r of rows) {
    console.log(r.name.padEnd(19) + String(r.prompt).padStart(15) + (base && r !== base ? `${r.prompt - base.prompt >= 0 ? '+' : ''}${r.prompt - base.prompt}` : '-').padStart(12) + String(r.tools).padStart(7) + String(r.skills).padStart(8) + String(r.plugins).padStart(9) + `$${r.cost.toFixed(3)}`.padStart(9));
  }
}

if (require.main === module) main();
module.exports = { CONFIGS };
