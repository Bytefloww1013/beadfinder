---
name: beadfinder-to-spec
description: Compiles closed decision beads and Beads memory into a comprehensive architectural specification (SPEC.md). Validates zero remaining planning fog before handoff to ticket generation. Trigger with /beadfinder-to-spec.
metadata:
  version: "0.5.0"
---

# Beadfinder: Specification Compiler (`to-spec`)

Reads all closed decision beads, dependencies, and memory records associated with a Map Epic and compiles them into a structured, unified `SPEC.md` document.

Runs in the wayfinder parent session (the handoff step). Do not spawn workers here; the implement slice you hand off is worked by spawned `implementer`/`reviewer` subagents.

## Core Rules

1. **Zero Open Planning Beads**: Ensure `bd ready --label phase:plan --json` returns `[]` and `bd list --parent <map-epic-id> --status open,in_progress --json` returns `[]` before compiling the spec.
2. **Contract Completeness**: The generated `SPEC.md` must include concrete types, interface schemas, state transitions, and test seams.
3. **Self-Contained Artifact**: Downstream builder agents must be able to implement tickets using only `SPEC.md` and the ticket description, without reading conversational history.

---

## Spec Compilation Procedure

### 1. Collect Graph Data & Memories
```bash
# Gate: nothing open under the map epic
bd ready --label phase:plan --json
bd list --parent <map-epic-id> --status open,in_progress --json

# All closed beads under the map epic (bd query is a filter language, not SQL)
bd list --parent <map-epic-id> --status closed --json
bd prime
```

### 2. Generate `SPEC.md`
Write `SPEC.md` to the root of the repository with the following structure:

```markdown
# Architectural Specification: [Feature Name]

## 1. Executive Summary & Destination
[High-level overview of the goal, scope, and non-goals]

## 2. Architectural Decisions Record (ADRs)
[Table summarizing all closed decision beads, options chosen, and justifications]

## 3. Domain Model & Data Schemas
[Exact database schemas, migration requirements, and TypeScript/Zod/Pydantic contracts]

## 4. API & Interface Specifications
[Endpoint routes, request/response JSON schemas, headers, auth requirements]

## 5. Invariants, Concurrency & Error Topography
[State machine rules, idempotency keys, error status codes, retry policies]

## 6. Testing Strategy & Seams
[Unit test boundaries, mocked external adapters, integration test matrix]
```

### 3. Verify Spec Quality
Run static validation:
- Does every data model have an explicit schema contract?
- Are all third-party API seams identified with mock specifications?
- Are all failure codes and error schemas documented?
