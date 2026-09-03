---
name: beadfinder
description: Multi-session architectural wayfinding, decision charting, and fog-of-war planning powered by Beads (bd). Traverses the 10 Architectural Pillars to chart exhaustive decision DAGs, resolves fog across focused agent sessions through a five-phase pipeline (plan, requirements, design, implement, review), and hands off an exhaustive blueprint for implementation. Use when planning large, complex, or ambiguous software projects, or when the user invokes /beadfinder or /wayfinder.
metadata:
  version: "0.7.0"
  tracker: beads
---

# Beadfinder: Deep Architectural Wayfinding

Beadfinder breaks down complex software projects whose destination is known but whose technical route is foggy. It plans rather than builds: charting decisions into a dependency graph of Beads issues, resolving them across focused agent sessions through five phases (plan → requirements → design → implement → review), and handing off a reviewed, implemented result. The phase machine, label vocabulary, and failure isolation are normative in [ARCHITECTURE.md](ARCHITECTURE.md).

## Core Rules

1. **Do Plan, Do Not Build (Until the Build Phase)**: Every planning, requirements, and design bead represents an architectural decision, a requirement, a technical uncertainty, or a spike—never a slice of production code. Production code exists only in the implement phase.
2. **Do Exhaustive Decision Mapping**: Actively probe the **10 Architectural Pillars**. Never artificially restrict the initial chart to 3–5 items; map every non-trivial decision.
3. **Do Practice Strict Phase Isolation**:
    - Planning beads: `--label phase:plan` (+ persona label `wayfind`)
    - Requirements beads: `--label phase:requirements` (+ persona label `research`; `product` for human-in-the-loop questions)
    - Design beads: `--label phase:design` (+ persona label `architect`)
    - Build beads: `--label phase:implement` (+ persona label `implementation`)
    - Submitted beads: `--label phase:review` (+ persona label `review`) — applied only by `scripts/review-submit.sh`
4. **Beads Native Frontier**: Discover actionable work with `bd ready` — through the pack scripts when a parent epic and persona apply, otherwise `bd ready --label phase:plan --json`. Never parse status strings manually. Never select an id in one step and claim it in another (the named-claim flow — `bd ready` to look, `bd update <id> --claim` on the id you looked at — is the sanctioned exception).
5. **Durable Knowledge Bus**: Record lasting invariants and locked choices via `bd remember "Decision: <takeaway>"`.
6. **One Decision Bead Per Session, In Plan Phase**: In the Plan Phase interactive mode, claim one unblocked bead, resolve it through structured dialogue, research, or spikes, record the resolution, and stop.
7. **One or More Decisions per Session, In Build Phase**: In the Build Phase interactive mode, claim one or more unblocked beads, implement them, and submit each for review (`scripts/review-submit.sh`) — or spawn one blocking `implementer` per ticket via `/beadfinder-implement`. Nobody closes a build bead except the reviewer on a passing review (`/beadfinder-review`).
8. **Scripts Over Hand-Rolled bd**: Run the pack scripts from this skill's `scripts/` directory (see Scripts). Prefer them over hand-rolled `bd ready | jq` pipelines.
9. **Spawn Workers, Do Not Absorb Their Roles**: This skill orchestrates (see Spawn Rules). Human-in-the-loop work stays in this session; AFK work belongs to a spawned subagent.
10. **Child Beads Never Inherit Labels**: pass `--no-inherit-labels` on every `bd create --parent …` and set labels explicitly (label inheritance would copy the epic's labels onto children and strand them).

---

## The 10 Architectural Decision Pillars

When charting a new system, feature, or refactor, systematically generate decision beads across all 10 pillars:
[Reference: Architectural Decision Pillars](references/architectural-pillars.md)

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

### 3. Plan Phase — Seed Decision Beads Across the 10 Pillars
Create child decision beads linked to the root map epic. State each bead title as a clear question or choice. This phase defines project scope, goals, costs, and resource allocation:

- **`beadfinder:grill` (human-in-the-loop)**: For architectural trade-offs requiring user alignment.
  ```bash
  bd create "Decision: <Question to Answer>" -t task -p 1 \
    --parent <map-epic-id> --no-inherit-labels \
    --label phase:plan --label wayfind --label beadfinder:grill \
    --label product --label hitl \
    -d "Pillar: <Pillar Name>\nContext: <Why this decision matters>\nOptions:\n1. <Option A>\n2. <Option B>\nTrade-offs: <Key trade-off summary>"
  ```
- **`beadfinder:research` (AFK)**: For empirical codebase or library investigation.
  ```bash
  bd create "Research: <Technical Uncertainty>" -t task -p 2 \
    --parent <map-epic-id> --no-inherit-labels \
    --label phase:plan --label wayfind --label beadfinder:research --label afk \
    -d "Objective: <Investigation goal>\nPointers: <Relevant repo files or external docs>"
  ```
- **`beadfinder:prototype` (human-in-the-loop)**: For throwaway spikes evaluating ergonomics or UI.
  ```bash
  bd create "Spike: <Behavior or UI Prototype>" -t task -p 2 \
    --parent <map-epic-id> --no-inherit-labels \
    --label phase:plan --label wayfind --label beadfinder:prototype --label hitl \
    -d "Spike Goal: <What behavior to test>\nArtifact: <Disposable script or mockup>"
  ```

Mode labels (`hitl`, `afk`) drive the Spawn Rules below. Persona labels on plan beads are domain markers; human-in-the-loop and spawned research are claimed by named id, never `claim-next.sh`.

### 4. Establish Blockers & Dependencies
```bash
bd dep add <downstream-bead-id> <upstream-bead-id> --type blocks
```

### 5. Work the Plan Frontier
In each session:
1. **Query Frontier**:
   ```bash
   bd ready --label phase:plan --json
   ```
2. **Claim the Bead** (named claim; plan beads are human-in-the-loop or spawned research):
   ```bash
   bd update <bead-id> --claim
   ```
3. **Resolve Based on Type**:
   - For `beadfinder:grill`: Delegate to `/beadfinder-grill` or run focused trade-off dialogue here. Spawn a blocking `architect` subagent first when the bead needs an options brief or ADR groundwork; the human decision still happens in this session.
   - For `beadfinder:research`: Spawn a parallel, non-blocking `research` subagent running `/beadfinder-research` with the ticket id and Question. Do not research inline.
   - For `beadfinder:prototype`: Write a self-contained throwaway spike script to demonstrate behavior (human-in-the-loop; stays in this session).
4. **Fog Excavation (The Fog Sieve)**:
   If resolving this bead exposes new sub-decisions, create new beads immediately, labeled with the current phase:
   ```bash
   bd create "Decision: <New Emergent Question>" --parent <map-epic-id> \
     --no-inherit-labels \
     --label phase:plan --label wayfind --label beadfinder:grill --label product --label hitl \
     --deps discovered-from:<current-bead-id>
   ```
5. **Close Bead & Store Memory**:
   ```bash
   bd close <bead-id> --reason "Resolution: <Concise rationale and locked decision>"
   bd remember "Decision [<Pillar>]: <Locked rule or invariant>"
   python3 scripts/append-decision.py --epic <map-epic-id> --title "<bead title>" --id <bead-id> --gist "<one-line decision>"
   ```

### 6. Requirements Phase (Gate G1)
When `bd ready --label phase:plan` returns empty under the map epic, gather and document functional and non-functional needs — the output is a Software Requirements Specification:

1. **Create the Requirements Slice**:
   ```bash
   bd create "Requirements: <Destination Title>" -t epic -p 1 \
     --parent <map-epic-id> --no-inherit-labels \
     --label beadfinder:slice --label phase:requirements \
     -d "Requirements graph derived from Plan Epic <map-epic-id> and its locked decisions."
   ```
2. **Seed Requirement Beads** — use the user's plan-phase responses plus your own open questions:
   - AFK research (`phase:requirements,research,afk`): facts the architect will need; spawn non-blocking `research` children (`/beadfinder-research`).
     ```bash
     bd create "Research: <requirement question>" -t task -p 2 \
       --parent <req-slice-id> --no-inherit-labels \
       --label phase:requirements --label research --label afk \
       -d "Objective: <what the architect needs to know>\nPointers: <repo files or external docs>"
     ```
   - Human questions (`phase:requirements,product,hitl`): priority, UAT expectations, acceptance criteria — answered in this session, never invented.
3. **Work the requirements queue** (`bd ready --label phase:requirements --json` or `scripts/frontier.sh --parent <req-slice-id> --persona research`), closing each bead with evidence.
4. **Compile the SRS**: run `/beadfinder-to-spec`. It gates on zero open beads under the map epic and the requirements slice, then compiles everything into `SPEC.md` and validates spec quality. SPEC.md is the exit artifact of this phase.

### 7. Design Phase (Gate G2)
Using what the requirements phase learned, create the architecture blueprint — high-level and low-level design:

1. **Create the Design Slice**:
   ```bash
   bd create "Design: <Destination Title>" -t epic -p 1 \
     --parent <map-epic-id> --no-inherit-labels \
     --label beadfinder:slice --label phase:design \
     -d "Design graph derived from SPEC.md (Requirements Epic <req-slice-id>)."
   ```
2. **Seed Design Tickets** (`phase:design,architect`): one per subsystem or ADR cluster. Spawn blocking `architect` subagents per ticket (or `scripts/claim-next.sh --parent <design-slice-id> --persona architect`). Architects write `ARCHITECTURE.md` (one section per subsystem) and `IMPLEMENTATION.md` (low-level design specs) sections.
3. **Additional research** (`phase:design,research,afk`): spawn non-blocking `research` children for anything the blueprint still needs.
4. **Cut the Build DAG**: when the design artifacts are complete, run `/beadfinder-to-tickets`. It consumes `SPEC.md` + `ARCHITECTURE.md` + `IMPLEMENTATION.md` and creates the fine-grained build graph (transition T4). The ticket DAG is the last design artifact.

### 8. Build & Review Phases
Execute the implement graph: for each build ticket spawn a blocking `implementer` (`/beadfinder-implement`), which submits via `scripts/review-submit.sh` when done. Then spawn the `reviewer` (`/beadfinder-review`) per submitted bead: it verifies evidence, scores quality/correctness/pillar-adherence 1–10 (`references/review-rubric.md`, pass = all ≥ 8), closes on pass or fails it back to the implementer — loop until pass. After each child returns, append the pass gist to the implement epic with `append-decision.py`. When every build bead has passed review, mark the map epic complete — the destination epic itself stays open, because the close-guard forbids closing destinations:

```bash
bd comment <map-epic-id> "All phases complete. Specification, design, and reviewed implementation delivered."
```
Requirements and design beads close in place (their artifact is the deliverable); only build beads flow through the review gauntlet. Emergent build work: the wayfinder runs `/beadfinder-to-tickets` for `discovered-from`-linked tickets — implementers never re-slice settled work.

---

## Spawn Rules

- The wayfinder session is the parent. Chart, dispatch, index. Do not implement product code.
- Human-in-the-loop (`beadfinder:grill`, `beadfinder:prototype`, `product` requirement questions) never leaves the parent. A background child will answer for the human.
- `research` spawns parallel and non-blocking (`/beadfinder-research`) in plan, requirements, and design phases. Everyone else blocks the parent.
- `architect` spawns blocking: ADR/options groundwork on plan grill beads; design-ticket work in the design phase.
- In the build phase, spawn one blocking `implementer` per build ticket (`/beadfinder-implement`) and one blocking `reviewer` per submitted bead (`/beadfinder-review`). Review loops until pass: the reviewer fails the bead back (`scripts/review-verdict.sh --fail`), the implementer fixes and re-submits (`scripts/review-submit.sh`).
- Child prompt includes: ticket title, id, parent epic id, decision gists to respect, "one ticket only", "claim before work".

## Scripts

Run from this skill's `scripts/` directory (the installer copies it next to this file). Prefer them over hand-rolled `bd ready | jq`.

- `session-boot.sh [--persona name] [--parent <epic-id>]` — start of every session
- `frontier.sh --parent <epic> --persona <name>` — look, do not claim
- `claim-next.sh --parent <epic> --persona <name>` — atomic pick+claim. Exit 2 = empty frontier: stop and report
- `review-submit.sh <id> [--summary "..."]` — implementer handoff: build bead → review queue (swaps `phase:implement`/`implementation` → `phase:review`/`review`, reopens + unassigns)
- `review-verdict.sh <id> --pass|--fail --reason "..."` — reviewer verdict: pass closes with the score reason; fail sends the bead back to the implementer queue
- `verify-review-flow.sh` — smoke-test the whole review loop against a scratch bd store (no side effects on this repo)
- `append-decision.py --epic <epic> --title "..." --id <ticket> --gist "..."` — Decisions-so-far append on a destination or slice epic
- `debug-log.py` — only when running the `beadfinder-debug` variant

Persona arg → role label used by the scripts: `wayfinder`→`wayfind`, `research`→`research`, `architect`→`architect`, `implementer`→`implementation`, `reviewer`→`review`, `product`→`product`. Build beads carry `implementation`; the `review` label is applied by `review-submit.sh` when a bead enters the review phase. Deprecated v0.6 role labels (`wayfinder`, `architecture`) are still routed by the hooks but must not be used on new beads.

---

## Gotchas
- **Do Not Answer Grilling Questions Autonomously**: human-in-the-loop beads require user collaboration; never invent user preferences.
- **Do Not Implement Code in Plan/Requirements/Design Tasks**: task beads in these phases are strictly for unblocking research (e.g. provisioning keys), never early feature code.
- **Implementers Never Close Their Own Builds**: finishing means `scripts/review-submit.sh`; only the reviewer closes, and only with a passing score record (`references/review-rubric.md`, pass = all three ≥ 8).
- **Never Skip Pillars**: Always check if authentication, error handling, and migrations apply before declaring planning complete.
- **Atomic Claims Only**: `scripts/claim-next.sh` for persona queues; `bd update <id> --claim` for a named ticket. Never `bd ready | jq` in one step and claim in another.
- **Phase Labels Move Only Via The Scripts**: hand-rolled `bd update` label swaps between `phase:implement` and `phase:review` strand work; use `review-submit.sh` / `review-verdict.sh`. Requirements and design beads close in place — no review handoff for them.
- **Explicit Labels On Child Beads**: always `--no-inherit-labels` with `bd create --parent`; inherited labels strand beads (a child inheriting `beadfinder:destination` cannot be closed).
- **Fresh Status, Not Chat Memory**: Confirm with `bd show <id> --json` before claiming or closing. A closed bead stays closed. The tracker dir is `.beads`; do not glob `beads/`.
