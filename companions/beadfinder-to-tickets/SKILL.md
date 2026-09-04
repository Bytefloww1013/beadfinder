---
name: beadfinder-to-tickets
description: Decomposes a settled SPEC.md + ARCHITECTURE.md + IMPLEMENTATION.md into 15–40+ fine-grained, tracer-bullet implementation beads with strict sequential DAG blocking chains in Beads (bd). Runs at the end of the Design stage. Trigger with /beadfinder-to-tickets.
metadata:
  version: "0.7.0"
---

# Beadfinder: Slicing Engine (`to-tickets`)

Consumes settled SPEC.md, ARCHITECTURE.md, and IMPLEMENTATION.md and converts them into a large graph of small, atomic, tracer-bullet implementation tickets. The ticket DAG is the last design artifact (T4 in ARCHITECTURE.md), cut at the end of the `phase:design` stage.

## The Single-Context-Window Rule

Every generated implementation bead MUST adhere to:
1. **Scope Limit**: Sized to be completely implemented, tested, and committed in a single fresh agent session (~10–30 minutes, 100–250 lines of diff).
2. **Tracer Bullet**: Represents a narrow, vertical slice of functionality through the necessary layers rather than a wide horizontal layer.
3. **Deterministic Verification**: Contains the exact test command and a clear acceptance checklist.
4. **Micro-Slicing Target**: A standard feature should produce **15–40+ micro-beads**, never 2–4 macro tasks.

---

## The 7-Layer Vertical Slicing Pattern

When decomposing an architectural module, generate separate beads for each discrete layer:

```
[1. Database Migration & Table Schemas]
                   │ (blocks)
[2. Domain Types & Validation Contracts]
                   │ (blocks)
[3. Core Domain Service & Unit Tests (TDD Seam)]
                   │ (blocks)
[4. Repository / Storage Adapter & Test Fixtures]
                   │ (blocks)
[5. API Route Handlers & Parsing Middleware]
                   │ (blocks)
[6. Error Handling, Rate Limits & Edge Case Tests]
                   │ (blocks)
[7. End-to-End Integration Suite & Telemetry Verification]
```

---

## Ticket Generation Procedure

### 1. Create the Implementation Epic
The `beadfinder:slice` label is what `session-boot.sh` lists on later sessions:
```bash
bd create "Implement: <Feature Name>" -t epic -p 1 \
  --label beadfinder:slice --label phase:implement \
  --no-inherit-labels \
  -d "Implementation graph derived from Plan Epic <plan-epic-id> and SPEC.md."
```

### 2. Generate Micro-Tasks Using the Standardized Template
For each atomic slice, create a bead with the following fields:

```bash
bd create "<Action Verb> <Precise Scope>" -t task -p 1 \
  --parent <impl-epic-id> --no-inherit-labels \
  --label phase:implement --label implementation \
  -d "Target Files:
- <file-path-1>
- <file-path-2>

Contract / Interface:
\`\`\`typescript
<Exact TypeScript/Python/Schema Contract>
\`\`\`

Verification Command:
\`<Exact test execution command>\`

Acceptance Criteria:
- [ ] <Verifiable condition 1>
- [ ] <Verifiable condition 2>
- [ ] Typecheck passes without errors"
```

The `implementation` persona label is what `claim-next.sh --persona implementer` filters on; every build bead MUST carry it. Labels are explicit, never inherited — `--no-inherit-labels` keeps parent-epic labels off build beads.

### 3. Review is per-bead
Every build bead cycles the phase pipeline (see ARCHITECTURE.md): the implementer submits it with `scripts/review-submit.sh`, the reviewer closes it on a passing review or fails it back for rework. No separate review ticket is created.

Build beads carry the `implementation` persona label; the `review` label is applied by the handoff script when the bead enters the review phase, not at creation.

Implementers may request emergent tickets via `--deps discovered-from:<current-id>`, but only the wayfinder runs this skill to slice them; never re-slice settled tickets.

### 4. Chain Blockers
Chain `blocks` **only where B cannot start before A** (e.g. schema → types that use it). Independent tasks stay parallel — do not serialize the whole slice into a linked list:
```bash
bd dep add <step-2-id> <step-1-id> --type blocks   # only if step 2 cannot start first
bd dep add <step-3-id> <step-2-id> --type blocks   # only if step 3 cannot start first
```

### 5. Verify the Frontier
Scripts live in the installed `beadfinder` skill's `scripts/` directory:
```bash
scripts/frontier.sh --parent <impl-epic-id> --persona implementer   # step 1 (and any parallel starts) visible
scripts/frontier.sh --parent <impl-epic-id> --persona reviewer      # submitted builds visible once builders run review-submit.sh
```
As builder agents submit each task, the reviewer frontier shows them; blocked work unlocks as reviewers close passed beads, and spawned `implementer`/`reviewer` subagents claim it atomically with `claim-next.sh`.
