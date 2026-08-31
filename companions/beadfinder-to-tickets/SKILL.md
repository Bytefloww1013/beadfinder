---
name: beadfinder-to-tickets
description: Decomposes a settled architectural specification (SPEC.md) into 15–40+ fine-grained, tracer-bullet implementation beads with strict sequential DAG blocking chains in Beads (bd). Trigger with /beadfinder-to-tickets.
metadata:
  version: "0.4.0"
---

# Beadfinder: Slicing Engine (`to-tickets`)

Converts a completed architectural specification (`SPEC.md`) into a large graph of small, atomic, tracer-bullet implementation tickets.

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
```bash
bd create "Implement: <Feature Name>" -t epic -p 1 \
  --label phase:implement \
  -d "Implementation graph derived from Plan Epic <plan-epic-id> and SPEC.md."
```

### 2. Generate Micro-Tasks Using the Standardized Template
For each atomic slice, create a bead with the following fields:

```bash
bd create "<Action Verb> <Precise Scope>" -t task -p 1 \
  --parent <impl-epic-id> --label phase:implement \
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

### 3. Chain Sequential Blockers
Chain the tasks into a strict dependency graph using `bd dep add`:
```bash
bd dep add <step-2-id> <step-1-id> --type blocks
bd dep add <step-3-id> <step-2-id> --type blocks
bd dep add <step-4-id> <step-3-id> --type blocks
bd dep add <step-5-id> <step-4-id> --type blocks
bd dep add <step-6-id> <step-5-id> --type blocks
bd dep add <step-7-id> <step-6-id> --type blocks
```

### 4. Verify the Frontier
Run `bd ready --label phase:implement --json` to verify that **only the very first task (Step 1)** is unlocked on the frontier. As builder agents close each task, the next task in the chain will automatically unlock.
