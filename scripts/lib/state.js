'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const f = (sid) => path.join(os.tmpdir(), `token-thrifty-${String(sid || 'x').replace(/[^\w-]/g, '')}.json`);

function load(sid) { try { return JSON.parse(fs.readFileSync(f(sid), 'utf8')); } catch (_) { return {}; } }
function save(sid, s) { try { fs.writeFileSync(f(sid), JSON.stringify(s)); } catch (_) { /* best effort */ } }
function reset(sid) { try { fs.unlinkSync(f(sid)); } catch (_) { /* nothing to reset */ } }

module.exports = { load, save, reset };
