---
name: lean-mode
description: Token-lean working habits for Claude Code. Use when a session is getting long, output is noisy, or the user asks to save tokens.
---
# Lean mode

Measured: the biggest savings came from the startup profile, not from these habits (a "work lean" instruction
showed no detectable cost change). Suggest `/token-thrifty:lean` if the user wants to cut real cost.

- Between unrelated tasks, suggest `/clear`: a fresh session was cheapest (3 tasks: $0.66 fresh, $1.03 in one
  session). Do NOT suggest `/compact` between unrelated tasks: it was the most expensive option ($2.95).
- Locate before reading: Grep/Glob first, then Read with `offset`/`limit`.
- Pipe noisy commands through `tail -n 40`, `head`, or `grep`, unless you need every row (counts, sums).
- Keep replies short: results and decisions, not narration.
- Keep CLAUDE.md short and stable so the prompt cache stays warm.
