# token-thrifty

A free Claude Code plugin that cuts wasted tokens. Only needs Node (already present with Claude Code installs via npm; otherwise install Node LTS). No API keys, no services, no binaries.

## What it does
| Feature | How | Hook |
|---|---|---|
| **Output compression** | Strips ANSI/progress bars, collapses repeated lines (`x300`), truncates huge lines, keeps head + tail + buried error/warning lines of long output | `PostToolUse` on Bash, Grep, Glob (replaces the output with `updatedToolOutput`) |
| **Big-read guard** | Blocks whole-file `Read` of files > 200 KB and tells Claude to Grep then Read with offset/limit | `PreToolUse` on Read |
| **Savings report** | `/token-thrifty:stats` shows estimated tokens saved | local log |
| **lean-mode skill** | Habits: locate before reading, tail noisy commands, `/clear`, stable CLAUDE.md for cache hits | skill |

Unlike wrapper tools, it never rewrites your command, so `cd`/env state and permission prompts behave normally. Compression is lossy only for bulk output; errors and warnings are preserved. Original output is never needed for small results (<1500 chars are untouched).

## Install
```
/plugin marketplace add a3k6g3d/Claude-Plug
/plugin install token-thrifty@claude-plug
```
Restart Claude Code, then run a noisy command and check `/token-thrifty:stats`.

## Config (env vars)
- `TOKEN_THRIFTY=off` disable everything
- `TT_READ_MAX_BYTES=200000` change read-guard threshold

## Honest expectations
Savings depend on your work: heavy on test/build/log output, expect large cuts to that output (often 70-90%) and roughly 15-40% of a whole session; little on pure chat. Stats use chars/4, an estimate. Pair with Anthropic prompt caching (automatic in Claude Code) by keeping CLAUDE.md stable.

## Develop
`npm test`
