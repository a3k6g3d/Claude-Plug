'use strict';
const fs = require('fs');
const path = require('path');
const { RULES, EXT } = require('./outline');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'target', '.next', 'venv', '.venv', '__pycache__', 'vendor']);

function* walk(dir, depth = 0) {
  if (depth > 8) return;
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const e of ents) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) yield* walk(path.join(dir, e.name), depth + 1); }
    else if (EXT[path.extname(e.name).slice(1).toLowerCase()]) yield path.join(dir, e.name);
  }
}

// Extract the definition starting at line index `start` (indent-based for Python, brace-matched otherwise).
function body(lines, start, kind, cap = 80) {
  const out = [lines[start]];
  if (kind === 'py') {
    const indent = lines[start].match(/^\s*/)[0].length;
    for (let i = start + 1; i < lines.length && out.length < cap; i++) {
      if (lines[i].trim() && lines[i].match(/^\s*/)[0].length <= indent) break;
      out.push(lines[i]);
    }
  } else if (kind === 'md') {
    const lvl = lines[start].match(/^#+/)[0].length;
    for (let i = start + 1; i < lines.length && out.length < cap; i++) {
      const m = lines[i].match(/^(#+)\s/);
      if (m && m[1].length <= lvl) break;
      out.push(lines[i]);
    }
  } else {
    let depth = 0;
    let opened = false;
    for (let i = start; i < lines.length && out.length < cap; i++) {
      if (i > start) out.push(lines[i]);
      for (const ch of lines[i]) { if (ch === '{') { depth++; opened = true; } else if (ch === '}') depth--; }
      if (opened && depth <= 0) break;
      if (!opened && i > start + 3) break;
    }
  }
  return out.join('\n');
}

function findSymbol(root, name, maxHits = 5) {
  const word = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const hits = [];
  for (const file of walk(root)) {
    let text;
    try { if (fs.statSync(file).size > 2 * 1024 * 1024) continue; text = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
    if (!word.test(text)) continue;
    const kind = EXT[path.extname(file).slice(1).toLowerCase()];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length < 300 && RULES[kind].test(lines[i]) && word.test(lines[i])) {
        hits.push(`${path.relative(root, file)}:${i + 1}\n${body(lines, i, kind)}`);
        if (hits.length >= maxHits) return hits;
      }
    }
  }
  return hits;
}

module.exports = { findSymbol };
