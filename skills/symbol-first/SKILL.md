---
name: symbol-first
description: Navigate code by symbol instead of reading whole files. Use when exploring an unfamiliar codebase or looking for a specific function, class or section.
---
# Symbol-first navigation

1. Need one function/class/heading? Call the `symbol` MCP tool (token-thrifty) with its name. It returns only that definition.
2. Need the shape of a file? Call `outline` with the path, then Read only the `offset/limit` range you need.
3. Only fall back to a full Read for small files or when you will edit most of the file.
4. Never Read a file you already have in context and that has not changed.
