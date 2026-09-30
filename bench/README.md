# A/B benchmark

Answers one question with real numbers: **does a token-saving plugin lower what a task actually costs?**

Estimated "tokens saved" (characters removed / 4) is not a bill. An independent test of a popular plugin
(JetBrains, RTK) found its own dashboard claiming 96M tokens saved while the real cost went *up*, because trimmed
output can cause extra turns. This harness measures the outcome instead: it runs the same read-only tasks through
`claude -p` once per arm and records the real `total_cost_usd`, tokens (including cache reads) and turns.

## Run

```
node bench/run.js --repo I:\your\project --dry-run     # plan + worst-case cost, executes nothing
node bench/run.js --repo I:\your\project --reps 3 --yes # spends money
node bench/report.js
```

* Trials are interleaved and randomised per task and repeat, and resumable (re-run the same command to continue).
* Each run is capped by `--budget` (default $1). Options: `--model`, `--only tests,tour`, `--out`, `--claude <path>`.
* Tasks are read-only by prompt, and Edit/Write/web tools are disallowed. Bash is allowed, so point it at a repo you
  are comfortable running tests in.
* Each trial verifies the plugin set that actually loaded (from the `init` event) and warns if an arm is not what it says.
* `compressions` counts how many outputs token-thrifty rewrote during the trial, so a "no difference" result can be told
  apart from "the plugin never fired".
* Compare the saved answers in `bench/results/*.txt` across arms: a saving only counts if the answer is still right.

## Adding another plugin as an arm

Install it, then add an arm to `bench/arms.json` that enables it and disables the others, e.g.

```json
"token-saver": {
  "settings": { "enabledPlugins": { "token-thrifty@claude-plug": false, "token-saver@token-saver": true } },
  "expectPlugins": { "token-thrifty": false, "token-saver": true }
}
```

Never enable two compressors in the same arm: they would process the same output twice.

## Reading the report

Deltas are paired (same task, same repeat, vs baseline). The verdict is "no detectable difference" when the 95%
bootstrap confidence interval of the median change includes 0. Small samples usually land there; add reps or tasks
before drawing conclusions.
