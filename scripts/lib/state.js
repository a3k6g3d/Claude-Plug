'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

// Per-session scratch state. `ns` keeps independent hooks from overwriting each other's file.
const f = (sid, ns) => path.join(os.tmpdir(), `token-thrifty-${ns ? `${ns}-` : ''}${String(sid || 'x').replace(/[^\w-]/g, '')}.json`);

function load(sid, ns) { try { return JSON.parse(fs.readFileSync(f(sid, ns), 'utf8')); } catch (_) { return {}; } }
function save(sid, s, ns) { try { fs.writeFileSync(f(sid, ns), JSON.stringify(s)); } catch (_) { /* best effort */ } }
function reset(sid) {
  for (const ns of [undefined, 'out']) { try { fs.unlinkSync(f(sid, ns)); } catch (_) { /* nothing to reset */ } }
}

module.exports = { load, save, reset };
