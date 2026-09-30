'use strict';
// Prints the lean startup profile that measured best in A/B testing, and what it gives up.
// A plugin cannot remove tools or connectors itself, so this is a launch recipe, not a hook.
const path = require('path');

const TOOLS = 'Bash,Read,Grep,Glob,Edit,Write';
const SETTINGS = JSON.stringify({ enabledPlugins: { 'cowork-plugin-management@synced': false, 'pdf-viewer@synced': false } });

const lines = [
  'Lean startup profile (measured on one project, sonnet; your results may differ)',
  '',
  '  Startup prompt: 56K -> 23.5K tokens (-58%)',
  '  Real cost on 12 paired exploration tasks: median -34% (range -46% to -12%), cheaper in 10 of 12',
  '',
  'Launch from a terminal (not the desktop app UI):',
  '',
  `  claude --strict-mcp-config --tools "${TOOLS}" --settings '${SETTINGS}'`,
  '',
  'Gives up: MCP connectors, WebFetch/WebSearch, the PowerShell and other extra tools, and the synced',
  'plugins listed above. Skills are not the cost: turning them off changed the prompt by ~0 tokens.',
  'Open-ended searches may take more (cheaper) turns.',
  '',
  'Desktop app: there are no flags. Disable connectors and plugins you never use in the app settings.',
  '',
  'Also measured:',
  '  - Between unrelated tasks, start a fresh session (/clear): 3 tasks cost $0.66 fresh vs $1.03 in one',
  '    session vs $2.95 with /compact after each task. Compacting was the most expensive option.',
  '  - A "work lean" instruction and a Haiku explorer subagent did not lower cost.',
  `  - Re-run the numbers yourself with the harness in ${path.join('bench', 'README.md')}.`,
];

if (require.main === module) console.log(lines.join('\n'));
module.exports = { lines, TOOLS, SETTINGS };
