---
name: lean-mode
description: Token-lean working habits for Claude Code. Use when a session is getting long, output is noisy, or the user asks to save tokens.
---
# Lean mode

- Locate before reading: Grep/Glob first, then Read with `offset`/`limit`. Never read whole large files.
- Never re-read a file already in context unless it changed.
- Pipe noisy commands through `tail -n 40`, `head`, or `grep` (`npm test 2>&1 | tail -40`).
- Prefer `git diff --stat`, `git log --oneline -n 10`, `git status -sb` over full output.
- Keep replies short: results and decisions, not narration.
- Suggest `/clear` between unrelated tasks and `/compact` around 60% context.
- Keep CLAUDE.md short and stable so the prompt cache stays warm.
