'use strict';
// Minimal zero-dependency MCP server (stdio, newline-delimited JSON-RPC).
// Three tiny tools so the tool-definition overhead stays small.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { outline } = require('../scripts/lib/outline');
const { findSymbol } = require('../scripts/lib/symbols');
const { summarize } = require('../scripts/lib/stats');

const ROOT = fs.realpathSync(process.cwd());

const TOOLS = [
  { name: 'outline', description: 'Symbol outline (defs + line numbers) of a file, far cheaper than reading it.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'symbol', description: 'Return only the definition of a function/class/heading by name, searched across the repo.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'savings', description: 'Estimated tokens saved by token-thrifty so far.',
    inputSchema: { type: 'object', properties: {} } },
];

function inRoot(p) {
  const abs = fs.realpathSync(path.resolve(ROOT, p));
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) throw new Error('path outside project');
  return abs;
}

function call(name, args) {
  if (name === 'outline') {
    const abs = inRoot(args.path);
    const o = outline(fs.readFileSync(abs, 'utf8'), abs);
    return `${args.path}: ${o.total} lines\n` + (o.entries.join('\n') || '(no structure detected)');
  }
  if (name === 'symbol') {
    const hits = findSymbol(ROOT, String(args.name || ''));
    return hits.length ? hits.join('\n---\n') : `No definition of "${args.name}" found.`;
  }
  if (name === 'savings') {
    const s = summarize();
    return `${s.calls} outputs compressed, ~${Math.round((s.before - s.after) / 4)} tokens saved (estimate).`;
  }
  throw new Error(`unknown tool ${name}`);
}

function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') return { protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'token-thrifty', version: '0.3.0' } };
  if (method === 'tools/list') return { tools: TOOLS };
  if (method === 'ping') return {};
  if (method === 'tools/call') {
    try { return { content: [{ type: 'text', text: call(params.name, params.arguments || {}) }] }; }
    catch (e) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
  }
  if (id === undefined) return undefined; // notification
  const err = new Error('method not found'); err.code = -32601; throw err;
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  try {
    const result = handle(msg);
    if (msg.id !== undefined && result !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\n');
  } catch (e) {
    if (msg.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: e.code || -32603, message: e.message } }) + '\n');
  }
});
