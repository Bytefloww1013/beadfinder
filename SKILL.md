---
name: beadfinder
description: Multi-session architectural wayfinding powered by Beads (bd). Charts exhaustive decision DAGs through plan → requirements → design → implement ⇄ review and hands off a reviewed implementation. Use when planning large, complex, or ambiguous software projects, or when the user invokes /beadfinder or /wayfinder.
metadata:
  version: "0.8.0"
  tracker: beads
---

# Beadfinder

Charts the route to a known destination through fog. Plans rather than builds until implement: decisions become Beads issues, resolved across focused sessions. Operator's view; pack repo ARCHITECTURE.md is the normative machine.

## Core Rules

1. **Do not build in plan.** Production code exists only in implement; earlier beads are decisions, requirements, uncertainties, or spikes.
2. **Map exhaustively.** Probe all 10 Architectural Pillars (`references/architectural-pillars.md`); never cap the initial chart at 3–5 items.
3. **Phase isolation.** Exactly one `phase:*` per bead, set at creation. Implement↔review moves only via handoff scripts.
4. **Beads-native frontier.** Pack scripts or `bd ready --label phase:<phase> --json`. Never parse status strings. Named-claim (`bd ready` then `bd update <id> --claim`) is the only look-then-claim exception.
5. **Durable knowledge bus.** `bd remember "Decision: <takeaway>"`.
6. **One ticket.** Plan HITL: one bead per session. Build: one implementer per ticket, one reviewer per submit.
7. **Reviewer is the only closer of build beads.** Implementers submit via `review-submit.sh`; only a passing reviewer closes.
8. **Scripts over hand-rolled bd.** Prefer pack `scripts/` over `bd ready | jq`.
9. **Spawn, don't absorb.** Orchestrate. HITL stays here; AFK work is a spawned subagent.
10. **`--no-inherit-labels`** on every `bd create --parent …`; set labels explicitly or children inherit the epic and strand.

## Phase machine

`plan → requirements → design → implement ⇄ review → closed`

| Phase | Label / persona arg | Load | Exit |
|---|---|---|---|
| Plan | `phase:plan` / `wayfinder` | HITL; `/beadfinder-grill`, `/beadfinder-research` | plan frontier empty |
| Requirements | `phase:requirements` / `research`, `product` | AFK `/beadfinder-research`; product HITL; `/beadfinder-to-spec` | SPEC.md passes |
| Design | `phase:design` / `architect` | blocking architects; `/beadfinder-to-tickets` | ticket DAG cut |
| Implement | `phase:implement` / `implementer` | `/beadfinder-implement` | `review-submit.sh` |
| Review | `phase:review` / `reviewer` | `/beadfinder-review` | pass → closed; fail → implement |

Requirements and design beads close in place. Only build beads flow implement ⇄ review. Fog excavated mid-phase is a child of the current phase (`--deps discovered-from:<id>`). Destination epic (`beadfinder:destination`, `phase:plan`) stays open; later phases get a `beadfinder:slice` epic with that phase's label.

**Dispatch.** `frontier.sh` / `claim-next.sh` filter on `phase:*`, not role labels. Persona arg → phase: `wayfinder`→`phase:plan`, `research`→`phase:requirements`, `architect`→`phase:design`, `implementer`→`phase:implement`, `reviewer`→`phase:review`, `product`→`phase:requirements`. Role labels (`wayfind`, `implementation`, `review`, …) are optional informational tags, not query barriers. `review-submit.sh` / `review-verdict.sh` swap only `phase:implement` ↔ `phase:review`.

## Session start

```bash
scripts/session-boot.sh [--persona name] [--parent slice-id] [--json]
bd prime || bd init --quiet
```

Agree the destination, create a `beadfinder:destination` epic (`phase:plan`), seed grill / research / prototype children with `--no-inherit-labels` and explicit phase labels. When the plan frontier is empty, cut a `beadfinder:slice` epic per later phase. After a plan bead closes or a review passes, append the gist with `append-decision.py`.

## Spawn rules

- HITL (`beadfinder:grill`, `beadfinder:prototype`, `product` questions) stays in the parent. Never invent the human's answer.
- `research` spawns parallel and non-blocking (`/beadfinder-research`). Everyone else blocks.
- Worker subagents load their dedicated companion skill directly (`implementer` loads `beadfinder-implement`; `reviewer` loads `beadfinder-review`), omitting the root orchestrator skill for token efficiency.
- Build: one blocking `/beadfinder-implement` per ticket; one blocking `/beadfinder-review` per submitted bead. Fail → fix → re-submit; loop until pass.
- Child prompt: title, id, parent epic, decision gists, "one ticket only", "claim before work".

## Scripts

Run from this skill's `scripts/` (installer copies it next to this file).

- `session-boot.sh [--persona name] [--parent slice-id] [--json]` — prime memory; list live destinations/slices and ready work
- `frontier.sh --parent <epic> --persona <name>` — look, do not claim (`phase:*` for that persona)
- `claim-next.sh --parent <epic> --persona <name>` — atomic pick+claim; exit 2 = empty frontier, stop and report
- `review-submit.sh <id> [--summary "..."]` — `phase:implement` → `phase:review` (reopen + unassign)
- `review-verdict.sh <id> --pass|--fail --reason "..."` — pass closes; fail swaps back to `phase:implement`
- `test-run.sh <command>` — run verification tests with output compression (15-line tail on pass, focused failure excerpts)
- `verify-review-flow.sh` — smoke-test the review loop against a scratch store
- `append-decision.py --epic <epic> --title "..." --id <ticket> --gist "..."` — append a gist to a destination or slice epic

## Gotchas

- **Don't invent HITL answers.** Grill, prototype, and product beads need the user.
- **Don't close your own builds.** Finish with `review-submit.sh`. Only the reviewer closes, and only with a passing score (`references/review-rubric.md`, all three ≥ 8).
- **Fresh status via `bd show`.** `bd show <id> --json` before claiming or closing. A closed bead stays closed.
- **Tracker dir is `.beads`**, never glob `beads/`.
- **Atomic claims only.** `claim-next.sh` for persona queues; `bd update <id> --claim` for a named ticket. Never `bd ready | jq` then claim.
- **Phase labels move only via the scripts.** Hand-rolled implement↔review swaps strand work.
