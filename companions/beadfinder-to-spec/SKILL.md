---
name: beadfinder-to-spec
description: Compiles closed plan decision beads and requirement beads into SPEC.md, the Software Requirements Specification. Trigger at the end of the Requirements stage. Trigger with /beadfinder-to-spec.
metadata:
  version: "0.7.0"
---

# Beadfinder: Specification Compiler (`to-spec`)

Reads closed plan decision beads, requirement beads, and memory records associated with the map epic and requirements slice, and compiles them into a structured, unified `SPEC.md` document — the Software Requirements Specification (SRS).

Runs in the wayfinder parent at the requirements exit gate — the end of the Requirements stage; SPEC.md must be validated here before the design slice is cut (ARCHITECTURE.md G2). It closes out the requirements stage: the `beadfinder:slice` epic carrying `phase:requirements`. Do not spawn workers here.

## Core Rules

1. **Zero Open Beads, Non-Vacuous Slice**: Ensure `bd ready --label phase:plan --parent <map-epic-id> --json` returns `[]` and `bd list --parent <requirements-slice-id> --status open,in_progress --json` returns `[]` before compiling the spec. The requirements slice must also hold at least one CLOSED requirement bead (`bd list --parent <requirements-slice-id> --status closed --json` is non-empty); an empty slice must abort with an explicit error — never emit a zero-requirements SPEC.
2. **Contract Completeness**: The generated `SPEC.md` must include concrete types, interface schemas, state transitions, and test seams.
3. **Self-Contained Artifact**: Downstream builders must be able to implement tickets from `SPEC.md`, the design artifacts, and the ticket description, without reading conversational history.

---

## Spec Compilation Procedure

### 1. Collect Graph Data & Memories
```bash
# Gate: nothing open under the map epic or the requirements slice,
# and at least one closed requirement bead (non-vacuous slice)
bd ready --label phase:plan --parent <map-epic-id> --json
bd list --parent <requirements-slice-id> --status open,in_progress --json
bd list --parent <requirements-slice-id> --status closed --json   # must be non-empty

# Closed plan decisions (map epic)
bd list --parent <map-epic-id> --status closed --json
bd prime
```

### 2. Generate `SPEC.md`
Write `SPEC.md` to the root of the repository with the following structure:

```markdown
# Requirements Specification: [Feature Name]

## 1. Executive Summary & Destination
[High-level overview of the goal, scope, and non-goals]

## 2. Functional & Non-Functional Requirements
[Functional: user stories and flows per capability. Non-functional: performance budgets, security, availability, compliance]

## 3. Architectural Decisions Record (ADRs)
[Table summarizing all closed decision beads, options chosen, and justifications]

## 4. Domain Model & Data Schemas
[Interface-level data schemas (shape and validation rules; implementation detail belongs to design), migration requirements, and TypeScript/Zod/Pydantic contracts]

## 5. API & Interface Specifications
[Endpoint routes, request/response JSON schemas, headers, auth requirements]

## 6. Invariants, Concurrency & Error Topography
[State machine rules, idempotency keys, error status codes, retry policies]

## 7. Testing Strategy & Seams
[Unit test boundaries, mocked external adapters, integration test matrix]
```

Sections 4–6 capture interface-level requirements — the "what" at each seam. Implementation-level design (how) belongs to the Design phase's ARCHITECTURE.md / IMPLEMENTATION.md.

Design consumes SPEC.md; design work (ARCHITECTURE.md, IMPLEMENTATION.md, ticket slicing) is out of scope here.

### 3. Verify Spec Quality
Run static validation:
- Does every data model have an explicit schema contract?
- Are all third-party API seams identified with mock specifications?
- Are all failure codes and error schemas documented?
