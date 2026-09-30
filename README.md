# token-thrifty

A free Claude Code plugin that trims noisy tool output and guards against wasteful file reads. Node only (already present with Claude Code installs via npm; otherwise install Node LTS). No API keys, no services, no binaries, no network calls.

**Read "What was measured" before installing.** The short version: it makes verbose build/test output much smaller and is cheap to run, but across a mixed set of real tasks its effect on actual cost was too small to detect. It is not a large money saver.

## What it does

| Feature | How | Hook |
|---|---|---|
| **Output compression** | Strips ANSI and progress bars, collapses repeated lines (`x300`), shortens huge lines, and keeps head + tail + buried error/warning lines of long output | `PostToolUse` on Bash, PowerShell, Grep, Glob (replaces the output via `updatedToolOutput`) |
| **Passing-test collapse** | Turns runs of passing tests into `[23 passing test lines collapsed]`. Understands node `--test`, vitest/jest verbose, TAP, `pytest -v`, `go test -v`, `cargo test`, `unittest -v`. Failures, headers and summaries are never touched | same hook |
| **Line caps by command type** | Ordinary logs are cut above 120 lines. Commands that return rows the model will count or scan (`git log/diff/show`, `grep`, `find`, `ls`, `wc`, `awk`, ...) get 800. Deliberate file reads (`sed -n`, `cat`, `head`, `tail`, `Get-Content`) get 300 | same hook |
| **Error-line safeguard** | After compression, any error/warning-looking line of the original that is no longer visible is appended back (up to 30) | same hook |
| **Full output kept** | When lines are omitted, the untouched output is saved to a temp file and the marker names it, so Claude can Grep it instead of re-running the command. Files are deleted after 24 hours | same hook |
| **Cross-call dedup** | If a re-run of the same command mostly repeats lines Claude already saw, only the new lines are shown (plus every error line, plus a count of lines that vanished) | same hook |
| **Backfire guard** | If a command whose output was trimmed is re-run and gives identical output, Claude came back for what was cut: it gets everything this time and trimming is switched off for that command for the session. Counted in `/token-thrifty:stats` | same hook |
| **Outline-on-big-read** | A whole-file `Read` of a file over 200 KB is answered with a symbol outline so Claude can jump to `offset/limit` | `PreToolUse` on Read |
| **Re-read guard** | Re-reading an unchanged file range in the same session is refused (it is already in context). State resets on `/clear` and after compaction | `PreToolUse` on Read + `SessionStart` |
| **MCP connector** | Three small tools: `outline`, `symbol` (returns one function/class/heading by name), `savings` | `mcpServers` in plugin.json |
| **Skills** | `lean-mode`, `symbol-first`, `context-audit` | skills |
| **Commands** | `/token-thrifty:stats`, `/token-thrifty:report`, `/token-thrifty:audit` (see below) | commands |

It never rewrites your command, so `cd`/env state and permission prompts behave normally. Outputs under 1,500 characters are left alone.

## What was measured

Everything below was measured on one Windows machine, mostly on one project, with one model (sonnet). Treat it as evidence, not a guarantee.

**Replay of real transcripts** (163 sessions, about 3.6M tokens of tool output): the compression pipeline would have removed an estimated 9% of Bash/PowerShell output, about 4% of all tool output. Reads are 47% of tool output and are mostly left alone on purpose.

**A/B benchmarks** (same tasks through `claude -p`, plugin on vs off, real cost from the CLI; harness in [`bench/`](bench/README.md)):

| Task set | Result |
|---|---|
| 4 light read-only tasks, 12 pairs | No detectable difference in cost (median +0.8%, 95% range -15.7% to +19.3%). The plugin fired in only 3 of 12 trials because the outputs were mostly small |
| 4 heavy-output tasks, 12 pairs | No detectable difference overall (median -2.0%, range -18.8% to +55.6%) |
| Verbose test output (3 pairs within the heavy set) | About 29% cheaper with the plugin in all 3 pairs, with the same correct answer. This is where it helps |
| `git log --stat` (first run) | Looked about 2x costlier in 3 of 3 pairs. Later runs did not reproduce it cleanly (baseline behaviour varies a lot). One real cause was found: trimmed rows made Claude re-run the command to check. Data-style commands now have a high cap and the backfire guard was added. A follow-up with 3 pairs showed no penalty but is too small to prove anything |

**The bigger cost is elsewhere.** A trivial "reply ready" run costs about $0.07, and a typical light task $0.16, so roughly 45% of a light task is the fixed startup context (about 57K tokens before you type anything). Nothing that only shrinks tool output can touch that. `/token-thrifty:audit` reports your measured number.

An independent benchmark of a different output-compression tool ([JetBrains, rtk](https://blog.jetbrains.com/ai/2026/07/rtk-claude-code-token-savings/)) found the same shape: large claimed savings, no real cost reduction on mixed tasks, because output compression only reaches a slice of total spend.

## Where it can hurt

- **Trimmed output can cost extra turns.** If Claude needs a line that was cut, it may re-run or go looking. The error-line safeguard, the saved full output and the backfire guard reduce this; they do not eliminate it.
- **Dedup and file-read logic add complexity for small gains** (dedup saved about 0.3% on the replay).
- **"Tokens saved" is an estimate** (characters removed / 4), not a measured bill.
- **Only some tool results are reachable.** Bash, PowerShell, Grep and Glob output can be rewritten. Read results and MCP results are not compressed.
- **Versions before 0.3.3 could blank CRLF (Windows) output.** Update if you installed earlier.
- **The benchmark sample is small** (12 pairs per set can only detect swings of roughly 15-20%).

## Install

```
/plugin marketplace add a3k6g3d/Claude-Plug
/plugin install token-thrifty@claude-plug
```

Restart Claude Code, then run a noisy command and check `/token-thrifty:stats`.

## Commands

- `/token-thrifty:stats`: how many outputs were compressed, the estimated tokens saved per tool, and any possible backfires.
- `/token-thrifty:report`: where this project's tokens went (largest tool outputs, files read repeatedly), from your local transcript.
- `/token-thrifty:audit`: your measured startup context (median first-turn size from recent sessions) plus CLAUDE.md and MCP estimates.

## Config (env vars)

- `TOKEN_THRIFTY=off` disables everything.
- `TT_READ_MAX_BYTES=200000` changes the read-guard threshold.

## Files it writes

- Stats log: `stats.jsonl` in the plugin data folder (`~/.claude/plugins/data/token-thrifty-claude-plug/` when installed).
- Full-output files: `token-thrifty-spill/` under your system temp folder, pruned after 24 hours.
- Per-session state: small `token-thrifty-*.json` files under your system temp folder.

## Measure it yourself

[`bench/`](bench/README.md) runs the same read-only tasks with the plugin on and off (and with other plugins as extra arms), records real cost, tokens and turns, checks that the arms really differ only by the plugin under test, and refuses to call a verdict on fewer than 8 pairs. It needs `claude auth login` first and spends real usage; `--dry-run` shows the plan and worst-case cost without running anything.

## Develop

`npm test`
