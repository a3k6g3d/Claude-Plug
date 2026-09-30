'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_AGE_MS = 24 * 3600 * 1000;
const dir = () => path.join(os.tmpdir(), 'token-thrifty-spill');

// Keep the full, uncompressed output on disk so omitted lines are never really lost.
// Returns the file path, or null if it could not be written (caller falls back to the plain hint).
function spill(text, sid) {
  try {
    fs.mkdirSync(dir(), { recursive: true });
    const name = `${String(sid || 'x').replace(/[^\w-]/g, '').slice(0, 12)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.txt`;
    const file = path.join(dir(), name);
    fs.writeFileSync(file, text);
    prune();
    return file;
  } catch (_) { return null; }
}

function prune() {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(dir())) {
      const p = path.join(dir(), f);
      if (now - fs.statSync(p).mtimeMs > MAX_AGE_MS) fs.unlinkSync(p);
    }
  } catch (_) { /* best effort */ }
}

module.exports = { spill, dir };
