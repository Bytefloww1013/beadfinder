---
name: beadfinder-debug
description: Same orchestrator as beadfinder, plus advisor logging to .opencode/beadfinder-debug.log or .omp/beadfinder-debug.log. Use when a session is mis-reading bead status, skipping claims, or you need a trail of hook blocks and agent concerns.
metadata:
  version: "0.4.0"
  tracker: beads
  debug: true
---

# Beadfinder (debug)

Follow **beadfinder** exactly. Same graph, labels, scripts, spawn rules, and hard rules. Load the `beadfinder` skill if the harness did not already.

This variant only adds a log.

## Log

Write every error, warning, or concern — yours or the hook advisor's — to the target repo:

- OpenCode: `.opencode/beadfinder-debug.log`
- Oh My Pi: `.omp/beadfinder-debug.log`

Use the pack script (from the installed skill `scripts/` directory, or this companion's copy):

```bash
python3 scripts/debug-log.py --level warning --source agent --message "claimed bd-12 but bd show says closed"
```

Levels: `error` `warning` `concern` `info`.
Sources: `agent` (you) `advisor` (hook / injected snapshot) `hook`.

Hook info lines (`tool_call`, `turn_end`) stay off unless `BEADFINDER_DEBUG=verbose`. Always log mismatches.

Tracker dir is `.beads`. Do not glob `beads/` — that path is not the Beads database.

Do this when:

- `bd show` / `bd list` status disagrees with earlier chat
- a hook blocked a tool (`[beadfinder:…]` in the tool error)
- frontier is empty but work continues
- a ticket looks open in memory after a close in this or another session
- a spawn or claim looks off

Do not skip the log because the concern turned out fine. The file is JSONL.

## Stale status

Beads on disk is the source of truth. Chat is not.

Before you claim, close, or tell the human a ticket is open:

1. `bd show <id> --json` in this turn
2. If `status` is `closed` / `done`, treat it as closed even if the conversation said otherwise
3. Log the mismatch
4. Do not reopen it to "keep going"

Session boot and the status-refresh hook inject a live snapshot. Prefer that over an older `bd ready` paste in the transcript.
