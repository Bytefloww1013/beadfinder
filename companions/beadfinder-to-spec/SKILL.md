---
name: beadfinder-to-spec
description: Compiles closed decision beads and Beads memory into a comprehensive architectural specification (SPEC.md). Validates zero remaining planning fog before handoff to ticket generation. Trigger with /beadfinder-to-spec.
metadata:
  version: "0.4.0"
---

# Beadfinder: Specification Compiler (`to-spec`)

Reads all closed decision beads, dependencies, and memory records associated with a Map Epic and compiles them into a structured, unified `SPEC.md` document.

## Core Rules

1. **Zero Open Planning Beads**: Ensure `bd ready --label phase:plan` returns empty before compiling the spec.
2. **Contract Completeness**: The generated `SPEC.md` must include concrete types, interface schemas, state transitions, and test seams.
3. **Self-Contained Artifact**: Downstream builder agents must be able to implement tickets using only `SPEC.md` and the ticket description, without reading conversational history.

---

## Spec Compilation Procedure

### 1. Collect Graph Data & Memories
```bash
# Query all closed beads under the map epic
bd query "SELECT id, title, description, close_reason FROM issues WHERE parent_id = '<map-epic-id>' AND status = 'closed'"
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
