---
name: beadfinder
description: Multi-session architectural wayfinding, decision charting, and fog-of-war planning powered by Beads (bd). Traverses the 10 Architectural Pillars to chart exhaustive decision DAGs, resolves fog across sessions, and orchestrates downstream spec and ticket generation. Use when planning large, complex, or ambiguous software projects, or when the user invokes /beadfinder or /wayfinder.
metadata:
  version: "0.5.0"
  tracker: beads
---

# Beadfinder: Deep Architectural Wayfinding

Beadfinder breaks down complex software projects whose destination is known but whose technical route is foggy. It plans rather than builds: charting decisions into a dependency graph of Beads issues, resolving them across focused agent sessions, and handing off an exhaustive blueprint for implementation.

## Core Rules

1. **Plan, Do Not Build**: Every planning bead represents an architectural decision, technical uncertainty, or spike—never a slice of production code.
2. **Exhaustive Decision Mapping**: Actively probe the **10 Architectural Pillars**. Never artificially restrict the initial chart to 3–5 items; map every non-trivial decision.
3. **Strict Phase Isolation**:
   - Planning beads: `--label phase:plan`
   - Implementation beads: `--label phase:implement`
4. **Beads Native Frontier**: Discover actionable work with `bd ready` — through the pack scripts when a parent epic and persona apply, otherwise `bd ready --label phase:plan --json`. Never parse status strings manually. Never select an id in one step and claim it in another.
5. **Durable Knowledge Bus**: Record lasting invariants and locked choices via `bd remember "Decision: <takeaway>"`.
6. **One Decision Bead Per Session, In Plan Phase**: In the Plan Pase interactive mode, claim one unblocked bead, resolve it through structured dialogue, research, or spikes, record the resolution, and stop.
7. **One or More Decisions per Session, In Implement Phase**: In the Implement Phase interactive mode, claim one or more unblocked beads, implement them, and close them with a concise rationale — or spawn one blocking `implementer` per ticket via `/beadfinder-implement`.
8. **Scripts Over Hand-Rolled bd**: Run the pack scripts from this skill's `scripts/` directory (see Scripts). Prefer them over hand-rolled `bd ready | jq` pipelines.
9. **Spawn Workers, Do Not Absorb Their Roles**: This skill orchestrates (see Spawn Rules). HITL stays in this session; AFK work belongs to a spawned subagent.

---

## The 10 Architectural Decision Pillars

When charting a new system, feature, or refactor, systematically generate decision beads across all 10 pillars:
[Architectural Decision Pillars - Reference](references/architectural-pillars.md)

---

## Workflow

### 1. Initialize & Prime Beads
Start every session with the boot script, then verify that Beads is initialized and persistent memory is loaded:
```bash
scripts/session-boot.sh      # primes memory, lists live destinations/slices and ready work
bd prime || bd init --quiet
```

### 2. Chart the Root Map Epic
1. **Agree on Destination**: Clarify the end-state goal with the human before creating tickets.
2. **Create the Root Epic**. The `beadfinder:destination` label is what `session-boot.sh` lists on later sessions:
   ```bash
   bd create "Wayfinder Map: <Destination Title>" -t epic -p 1 \
     --label beadfinder:destination --label phase:plan \
     -d "Destination: <Goal summary>\n\nOut of Scope:\n- <Excluded topics>\n\nNotes:\n- Architectural wayfinding in progress."
   ```

### 3. Seed Decision Beads Across the 10 Pillars
Create child decision beads linked to the root map epic. State each bead title as a clear question or choice:

- **`beadfinder:grill` (HITL)**: For architectural trade-offs requiring user alignment.
  ```bash
  bd create "Decision: <Question to Answer>" -t task -p 1 \
    --parent <map-epic-id> --label phase:plan --label beadfinder:grill \
    --label product --label hitl \
    -d "Pillar: <Pillar Name>\nContext: <Why this decision matters>\nOptions:\n1. <Option A>\n2. <Option B>\nTrade-offs: <Key trade-off summary>"
  ```
- **`beadfinder:research` (AFK)**: For empirical codebase or library investigation.
  ```bash
  bd create "Research: <Technical Uncertainty>" -t task -p 2 \
    --parent <map-epic-id> --label phase:plan --label beadfinder:research --label afk \
    -d "Objective: <Investigation goal>\nPointers: <Relevant repo files or external docs>"
  ```
- **`beadfinder:prototype` (HITL)**: For throwaway spikes evaluating ergonomics or UI.
  ```bash
  bd create "Spike: <Behavior or UI Prototype>" -t task -p 2 \
    --parent <map-epic-id> --label phase:plan --label beadfinder:prototype --label hitl \
    -d "Spike Goal: <What behavior to test>\nArtifact: <Disposable script or mockup>"
  ```

Mode labels (`hitl`, `afk`) drive the Spawn Rules below. Persona labels on plan beads are domain markers; HITL and spawned research are claimed by named id, never `claim-next.sh`.

### 4. Establish Blockers & Dependencies
```bash
bd dep add <downstream-bead-id> <upstream-bead-id> --type blocks
```

### 5. Work the Frontier
In each session:
1. **Query Frontier**:
   ```bash
   bd ready --label phase:plan --json
   ```
   In the implement phase use the persona queue instead: `scripts/frontier.sh --parent <impl-epic-id> --persona implementer` (or `reviewer`).
2. **Claim the Bead** (named claim; plan beads are HITL or spawned research):
   ```bash
   bd update <bead-id> --claim
   ```
   In the implement phase claim atomically: `scripts/claim-next.sh --parent <impl-epic-id> --persona implementer` (exit 2 = empty frontier: stop and report).
3. **Resolve Based on Type**:
   - For `beadfinder:grill`: Delegate to `/beadfinder-grill` or run focused trade-off dialogue here. Spawn a blocking `architect` subagent first when the bead needs an options brief or ADR groundwork; the human decision still happens in this session.
   - For `beadfinder:research`: Spawn a parallel, non-blocking research subagent running `/beadfinder-research` with the ticket id and Question. Do not research inline.
   - For `beadfinder:prototype`: Write a self-contained throwaway spike script to demonstrate behavior (HITL; stays in this session).
4. **Fog Excavation (The Fog Sieve)**:
   If resolving this bead exposes new sub-decisions, create new beads immediately:
   ```bash
   bd create "Decision: <New Emergent Question>" --parent <map-epic-id> \
     --label phase:plan --label beadfinder:grill --label product --label hitl \
     --deps discovered-from:<current-bead-id>
   ```
5. **Close Bead & Store Memory**:
   ```bash
   bd close <bead-id> "Resolution: <Concise rationale and locked decision>"
   bd remember "Decision [<Pillar>]: <Locked rule or invariant>"
   python3 scripts/append-decision.py --epic <map-epic-id> --title "<bead title>" --id <bead-id> --gist "<one-line decision>"
   ```
### 6. Terminal Handoff
When `bd ready --label phase:plan` returns empty and all decision beads under the map epic are closed:
1. Run `/beadfinder-to-spec` to compile all closed decisions into `SPEC.md`.
2. Run `/beadfinder-to-tickets` to generate the fine-grained implementation graph.
3. Close the root map epic:
   ```bash
   bd close <map-epic-id> "All architectural decisions locked. Specification compiled."
   ```
4. Execute the implement graph: spawn one blocking `implementer` per build ticket (`/beadfinder-implement`), then the `reviewer` on the review ticket. After each child returns, append the close gist to the implement epic with `append-decision.py`.

---

## Spawn Rules

- The wayfinder session is the parent. Chart, dispatch, index. Do not implement product code.
- HITL (`beadfinder:grill`, `beadfinder:prototype`) never leaves the parent. A background child will answer for the human.
- `architect` spawns blocking, for ADR/options groundwork on grill beads. It returns a gist; the decision is made in the parent.
- `research` spawns parallel and non-blocking (`/beadfinder-research`). Everyone else blocks the parent.
- In the implement phase, spawn one blocking `implementer` or `reviewer` per ticket (`/beadfinder-implement`).
- Spawn `product` only for non-grill requirements/UAT tickets; never for grill.
- Child prompt includes: ticket title, id, parent epic id, decision gists to respect, "one ticket only", "claim before work".

## Scripts

Run from this skill's `scripts/` directory (the installer copies it next to this file). Prefer them over hand-rolled `bd ready | jq`.

- `session-boot.sh [--persona name] [--parent <epic-id>]` — start of every session
- `frontier.sh --parent <epic> --persona <name>` — look, do not claim
- `claim-next.sh --parent <epic> --persona <name>` — atomic pick+claim. Exit 2 = empty frontier: stop and report
- `append-decision.py --epic <epic> --title "..." --id <ticket> --gist "..."` — Decisions-so-far append on a destination or slice epic
- `debug-log.py` — only when running the `beadfinder-debug` variant

Persona → role label used by the scripts: `wayfinder`, `architecture`, `implementation`, `review`, `product`. Execute-phase tickets must carry the matching persona label (`implementation`, `review`) or the scripts cannot find them.

---

## Gotchas
- **Do Not Answer Grilling Questions Autonomously**: HITL beads require user collaboration; never invent user preferences.
- **Do Not Implement Code in Tasks**: `beadfinder:task` is strictly for unblocking research (e.g. provisioning keys), never early feature code.
- **Never Skip Pillars**: Always check if authentication, error handling, and migrations apply before declaring planning complete.
- **Atomic Claims Only**: `scripts/claim-next.sh` for persona queues; `bd update <id> --claim` for a named ticket. Never `bd ready | jq` in one step and claim in another.
- **Fresh Status, Not Chat Memory**: Confirm with `bd show <id> --json` before claiming or closing. A closed bead stays closed. The tracker dir is `.beads`; do not glob `beads/`.
