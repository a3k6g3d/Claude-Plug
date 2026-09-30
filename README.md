# token-thrifty

A free Claude Code plugin that cuts wasted tokens. Only needs Node (already present with Claude Code installs via npm; otherwise install Node LTS). No API keys, no services, no binaries.

## What it does
| Feature | How | Hook |
|---|---|---|
| **Output compression** | Strips ANSI/progress bars, collapses repeated lines (`x300`), truncates huge lines, keeps head + tail + buried error/warning lines of long output | `PostToolUse` on Bash, Grep, Glob (replaces the output with `updatedToolOutput`) |
| **Outline-on-big-read** | A whole-file `Read` of a file > 200 KB is answered with a symbol outline (functions/classes/headings with line numbers) so Claude jumps straight to `offset/limit` in one step | `PreToolUse` on Read |
| **Re-read dedup** | Re-reading an unchanged file/range in the same session is refused (it is already in context); state resets on `/clear` and after compaction | `PreToolUse` on Read + `SessionStart` |
| **Where did my tokens go?** | `/token-thrifty:report` parses your transcript: tool output ranked by size, biggest single outputs, files read repeatedly | local transcript |
| **Savings report** | `/token-thrifty:stats` shows estimated tokens saved | local log |
| **MCP connector** (bundled, zero-dependency) | Three tiny tools: `outline` (file structure), `symbol` (returns just one function/class/heading by name, repo-wide), `savings`. Tool definitions are ~150 tokens total | `mcpServers` in plugin.json |
| **Skills** | `lean-mode`, `symbol-first` (use the MCP tools instead of whole-file reads), `context-audit` | skills |
| **`/token-thrifty:audit`** | Estimates fixed per-session cost: CLAUDE.md size, number of MCP servers | local files |
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
