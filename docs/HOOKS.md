# Beadfinder hooks — human reference

v0.5.0. Oh My Pi and OpenCode.

These hooks sit on harness events. The model cannot talk them out of a block. Skills still explain the rules; hooks refuse the move.

Kill switch: `BEADFINDER_HOOKS=off`.

Debug log (only with `beadfinder-debug` or `BEADFINDER_DEBUG=1`):

```
<target-repo>/.omp/beadfinder-debug.log         # Oh My Pi
<target-repo>/.opencode/beadfinder-debug.log    # OpenCode
```

Default lines are `error` / `warning` / `concern`. `info` (every tool_call / turn_end) needs `BEADFINDER_DEBUG=verbose`.

JSONL lines look like:

```json
{"ts":"2026-08-30T07:00:00Z","level":"warning","source":"advisor","hook":"status-refresh","message":"…","details":{}}
```

Install:

```bash
bash install.sh --omp
bash install.sh --omp --debug
bash install.sh --opencode
bash install.sh --opencode --debug
```

OMP hooks land in `.omp/extensions/beadfinder/` (or `~/.omp/agent/extensions/beadfinder` with `--global`). If a given OMP build discovers `hooks/pre` but never runs it, list the extension path in `.omp/settings.json`:

```json
{ "extensions": [".omp/extensions/beadfinder"] }
```

OpenCode hooks land in `.opencode/plugins/beadfinder.ts` (or `~/.config/opencode/plugins` with `--global`). OpenCode auto-loads `{plugin,plugins}/*.{ts,js}` at startup — restart OpenCode after install. No `opencode.json` `plugin` entry is required.

---

## How to read a block

A blocked tool error starts with `[beadfinder:<hook>]`. That name matches a section below.

---

## session-boot-inject

**When:** session start.

**Does:**
- Runs `bd prime`.
- Lists live destination epics and live slices (`open` and `in_progress` in **one** `bd list --status open,in_progress` query; slices of any type).
- Lists unlabeled `in_progress` tickets and `bd ready`.
- Reminds the agent that the store is `.beads/`, not `beads/`.
- Injects that live snapshot into the session.
- If hook state still has a claimed id, tells the agent to `bd show` it before acting.

**Why:** chat memory goes stale. `--status open` plus `--type epic` missed ready `in_progress` work (the 0.3 debug log: snapshot said none, `bd ready` still had the Auth slice). Two `--status` flags on one command silently overwrite; 0.3.1's two-query session-boot also printed two JSON arrays, so a parser could see `[]` and stop.

**You see:** a hidden/custom beadfinder message with destinations, slices, and ready work.

---

## status-refresh

**When:** start of an agent run, start of a turn (throttled), after `bd close`, after `session-boot.sh`.

**Does:**
- Re-reads live Beads.
- If the claimed id is `closed` / `done` on disk, injects a warning and clears the claim in hook state.
- Reminds the model not to trust an older `bd ready` paste.

**Throttle:** `BEADFINDER_REFRESH_MS` (default 45000).


---

## claim-gate

**When:** before product-file writes; before `claim-next.sh`; before `bd update --claim`; before `bd ready` + later `--claim` in the same command.

**Blocks:**
- Implementer product edits with no claimed ticket.
- A second non-research claim in the same session.
- Select-then-claim (`bd ready` without `--claim`, then `bd update --claim`).

**Allows:** wayfinder charting (`bd create` with no src edits), research-style reads, Beads comments.

---

## persona-fs-guard

**When:** `write` / `edit` / product-mutating bash.

**Blocks by persona:**

| Persona | Cannot touch |
|---|---|
| wayfinder, product | product trees (`src/`, `app/`, …) |
| architect | production feature files (ADR paths are allowed) |
| reviewer | any product file |
| implementer | protected / tracker files only |

**Why:** reviewer `tools: read, bash` is not enough. Bash can still rewrite src.

---

## hitl-affinity

**When:** spawn / task / subagent tools.

**Blocks:** a child whose prompt or payload contains `hitl`, `beadfinder:grill`, or “grill ticket”.

**Why:** a background child will answer for the human.

---

## spawn-contract

**When:** same spawn tools.

**Blocks:** a worker spawn whose prompt is missing ticket id, “one ticket only”, or “claim before work”.

**Why:** children do not share parent memory. The prompt is the contract.

---

## phase-gate

**When:** `bd create` with `phase:execute` or `beadfinder:build`.

**Blocks:** cutting an execute slice while the parent plan slice still has open children.

**Why:** `to-spec` already says refuse. Models still cut early.

---

## bd-close-guard

**When:** `bd close`.

**Blocks:**
- close without `--reason`
- close of a `beadfinder:destination`
- implementer closing any bead labeled `phase:review` or `review` (only the reviewer closes)
- reviewer close whose reason does not read `Review PASS` and contain all three N/10 scores (no labeled-order check)
- close of an epic that still has open children

**Why:** close is how later sessions learn the decision. A empty reason or a wrapped-up destination wrecks the map; an implementer self-pass skips the gauntlet.

---

## map-append-only

**When:** `bd update --description` on a destination or slice, unless the command is `append-decision.py`.

**Blocks:** hand-rewriting the map body.

**Why:** Decisions so far is an append-only index. Open tickets do not belong in that body.

---

## empty-frontier-stop

**When:** `claim-next.sh` returns empty / exit 2; later product writes in that session.

**Blocks:** `write` / `edit` on product files after an empty frontier (bash rewrites fall through to claim-gate / persona-fs-guard instead).

**Why:** unattended implementer with no queue starts making tickets up.

---

## beads-store

**When:** `glob` / `read` / `list_dir` of `beads` or `beads/`.

**Blocks:** looking at `beads/` (no leading dot).

**Why:** Anything else will not be the correct location

---

## beads-only

**When:** writes to `TODO.md` / `ISSUES.md` / GitHub issue templates; `gh issue create`.

**Blocks:** a second tracker.

---

## env-protection

**When:** read / write / edit of `.env`, `.git/`, `node_modules/`, key material.

**Blocks:** the tool call.

**Why:** unattended agents leak secrets into comments.

---

## budget-cap

**When:** each mutating write increments a counter.

**Blocks:** further writes after `BEADFINDER_MUTATING_BUDGET` (default 80).

**Why:** runaway AFK loops.

---

## yield-on-stop

**When:** OMP `agent_end` / `session_shutdown`. OpenCode `session.deleted` (not `session.idle` — that fires every turn).

**Does:** if hook state has a claimed ticket and mode is `afk` (or `BEADFINDER_YIELD_ON_STOP=1`), comments the bead and unassigns it.

**Default:** `BEADFINDER_YIELD_ON_STOP=afk`. HITL claims stay claimed so you can continue the same grill.

---

## compact-preserve

**When:** OMP is about to compact the session (`session.compacting`). OpenCode uses `experimental.session.compacting` (before the summary is written).

**Does:** stuffs claimed id, slice id, persona, and the last live snapshot into compact context.

**Why:** compact is how agents forget they already decided the rate-limit key.

---

## OpenCode event map

Same gates as above. Different event names:

| Job | OMP | OpenCode |
|---|---|---|
| pre | `tool_call` → `{ block: true, reason }` | `tool.execute.before` → `throw new Error("[beadfinder:…]")` |
| post | `tool_result` | `tool.execute.after` |
| boot | `session_start` | `session.created` (+ first `chat.message` if boot was missed) |
| status refresh | `before_agent_start` / throttled `turn_start` | throttled `chat.message` |
| compact | `session.compacting` | `experimental.session.compacting` |
| stop / yield | `agent_end` / `session_shutdown` | `session.deleted` only |

OpenCode `session.idle` fires after every turn, so yield-on-stop does **not** run there (it would drop AFK claims mid-work). Yield runs on `session.deleted`.

OpenCode also covers `apply_patch` (paths parsed from `*** Update File:` markers) and the `task` tool (`prompt` / `subagent_type`). Persona is taken from the OpenCode agent name (`wayfinder`, `architect`, …) as well as `session-boot.sh --persona`. Hook state is keyed by session id under `.opencode/beadfinder/state.json`.

---

## beadfinder-debug (skill + hook)

Not a gate. Only records.

**On when:**
- `bash install.sh --omp --debug` installed `skills/beadfinder-debug`, or
- `BEADFINDER_DEBUG=1`

**Writes:** `.omp/beadfinder-debug.log`

**Sources:**
- `advisor` — hook blocks, stale-status warnings, empty frontier
- `hook` — turn/agent lifecycle while debug is on
- `agent` — lines the model writes with `python3 scripts/debug-log.py`

**Use when:** a session treats a closed bead as open, a hook block is surprising, or you want a trail after an AFK run.

`status-stale` only fires on the **primary** `bd show` issue status, not the word “closed” in a description or child list. Empty-frontier only fires for `claim-next.sh` / `frontier.sh` output. Identical log lines within 80ms are dropped (OMP sometimes double-fires `tool_call`).

The debug skill is beadfinder plus “log the mismatch, re-query `bd show`.” It does not change graph rules.

---

## Env knobs

| Variable | Default | Meaning |
|---|---|---|
| `BEADFINDER_HOOKS` | on | `off` / `0` / `false` disables policy |
| `BEADFINDER_DEBUG` | unset | force the log even without the debug skill |
| `BEADFINDER_REFRESH_MS` | `45000` | min ms between live snapshots |
| `BEADFINDER_MUTATING_BUDGET` | `80` | write/edit cap per session |
| `BEADFINDER_YIELD_ON_STOP` | `afk` | `afk`, `1`, or `0`. OpenCode yields on `session.deleted` only. |

---

## What hooks do not decide

- Which ready ticket to take
- Whether an ADR gist is a good decision
- Grill answers
- Whether a loose idea needs a graph

Those stay in the skill.
