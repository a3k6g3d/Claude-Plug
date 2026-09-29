---
name: context-audit
description: Audit fixed per-session context overhead (CLAUDE.md size, MCP servers). Use when the user says sessions burn tokens before they type, or asks to slim setup.
---
Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/audit.js"`, show the output, then recommend the top three cuts (trim CLAUDE.md, disable unused MCP servers via `/mcp`, split rarely-needed instructions into skills so they load on demand).
