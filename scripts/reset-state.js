'use strict';
let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  try { require('./lib/state').reset(JSON.parse(raw).session_id); } catch (_) { /* ignore */ }
});
