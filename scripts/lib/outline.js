'use strict';
const path = require('path');

const RULES = {
  js: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|class|interface|type|enum)\s+\w+|^\s*(?:export\s+)?const\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/,
  py: /^\s*(?:async\s+)?(?:def|class)\s+\w+/,
  go: /^(?:func|type|var|const)\s+/,
  rs: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:fn|struct|enum|trait|impl|mod)\b/,
  oo: /^\s*(?:public|private|protected|internal|static|abstract|final|sealed|class|interface|enum)\b.*[({]\s*$/,
  md: /^#{1,6}\s/,
};
const EXT = {
  js: 'js', jsx: 'js', ts: 'js', tsx: 'js', mjs: 'js', cjs: 'js',
  py: 'py', go: 'go', rs: 'rs',
  java: 'oo', cs: 'oo', kt: 'oo', swift: 'oo', php: 'oo', c: 'oo', cpp: 'oo', h: 'oo', hpp: 'oo',
  md: 'md', markdown: 'md',
};

function outline(text, file, maxEntries = 150) {
  const kind = EXT[path.extname(file).slice(1).toLowerCase()];
  const lines = text.split('\n');
  const entries = [];
  if (kind) {
    const re = RULES[kind];
    for (let i = 0; i < lines.length && entries.length < maxEntries; i++) {
      if (lines[i].length < 300 && re.test(lines[i])) entries.push(`L${i + 1}: ${lines[i].trim().slice(0, 120)}`);
    }
  }
  return { total: lines.length, entries };
}

module.exports = { outline };
