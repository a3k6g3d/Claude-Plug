'use strict';
const fs = require('fs');
const path = require('path');

const SKIP = /\.(png|jpe?g|gif|webp|pdf|ipynb)$/i;
const MAX = Number(process.env.TT_READ_MAX_BYTES) || 200 * 1024;

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  try {
    if ((process.env.TOKEN_THRIFTY || '').toLowerCase() === 'off') return;
    const ev = JSON.parse(raw);
    const ti = ev.tool_input || {};
    if (!ti.file_path || ti.offset != null || ti.limit != null || SKIP.test(ti.file_path)) return;
    const size = fs.statSync(path.resolve(ev.cwd || process.cwd(), ti.file_path)).size;
    if (size <= MAX) return;
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `token-thrifty: ${ti.file_path} is ${Math.round(size / 1024)} KB. Use Grep to locate what you need, then Read with offset/limit. (Set TT_READ_MAX_BYTES or TOKEN_THRIFTY=off to disable.)`,
      },
    }));
  } catch (_) { /* missing file etc: let Read report it */ }
});
