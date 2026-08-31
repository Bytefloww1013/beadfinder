---
name: beadfinder
description: Multi-session architectural wayfinding, decision charting, and fog-of-war planning powered by Beads (bd). Traverses the 10 Architectural Pillars to chart exhaustive decision DAGs, resolves fog across sessions, and orchestrates downstream spec and ticket generation. Use when planning large, complex, or ambiguous software projects, or when the user invokes /beadfinder or /wayfinder.
metadata:
  version: "0.4.0"
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
4. **Beads Native Frontier**: Always use `bd ready --label phase:plan --json` to discover actionable work. Never parse status strings manually.
5. **Durable Knowledge Bus**: Record lasting invariants and locked choices via `bd remember "Decision: <takeaway>"`.
6. **One Decision Bead Per Session, In Plan Phase**: In the Plan Pase interactive mode, claim one unblocked bead, resolve it through structured dialogue, research, or spikes, record the resolution, and stop.
7. **One or More Decisions per Session, In Implement Phase**: In the Implement Phase interactive mode, claim one or more unblocked beads, implement them, and close them with a concise rationale.

---

## The 10 Architectural Decision Pillars

When charting a new system, feature, or major refactor, systematically generate decision beads across all 10 pillars:

1. **Domain & Entity Modeling**: Entity relationships, field definitions, enum sets, state machines, and relational constraints.
2. **Data Persistence & Lifecycle**: DB engine, schema indexing, transaction isolation levels, soft-delete vs hard-purge policies.
3. **Interface & Contract Boundaries**: Protocol (REST, GraphQL, gRPC), schema validation (Zod, Pydantic, Protobuf), response wrappers.
4. **Authentication, Authorization & RBAC**: Identity token format, session lifecycles, role-permission matrices, middleware placement.
5. **Concurrency, Idempotency & Mutations**: Mutation deduplication keys, distributed locks, race condition mitigation.
6. **Error Handling & Failure Topography**: Standard error schema, retry policies, backoff mechanisms, circuit breakers, fallback states.
7. **External Integrations & Seams**: Third-party APIs, webhooks, mock harnesses, sandbox testing strategies.
8. **Performance, Budgets & Caching**: Cache invalidation policies, latency thresholds, payload limits, pagination contracts.
9. **Observability, Metrics & Telemetry**: Structured log attributes, Prometheus metrics, distributed trace spans, health endpoints.
10. **State Migration & Seeding**: DB migration scripts, backward compatibility during rollout, mock data fixtures.

---

## Workflow

### 1. Initialize & Prime Beads
Verify that Beads is initialized and persistent memory is loaded:
```bash
bd prime || bd init --quiet
```

### 2. Chart the Root Map Epic
1. **Agree on Destination**: Clarify the end-state goal with the human before creating tickets.
2. **Create the Root Epic**:
   ```bash
   bd create "Wayfinder Map: <Destination Title>" -t epic -p 1 \
     --label phase:plan \
     -d "Destination: <Goal summary>\n\nOut of Scope:\n- <Excluded topics>\n\nNotes:\n- Architectural wayfinding in progress."
   ```

### 3. Seed Decision Beads Across the 10 Pillars
Create child decision beads linked to the root map epic. State each bead title as a clear question or choice:

- **`beadfinder:grilling` (HITL)**: For architectural trade-offs requiring user alignment.
  ```bash
  bd create "Decision: <Question to Answer>" -t task -p 1 \
    --parent <map-epic-id> --label phase:plan --label beadfinder:grill \
    -d "Pillar: <Pillar Name>\nContext: <Why this decision matters>\nOptions:\n1. <Option A>\n2. <Option B>\nTrade-offs: <Key trade-off summary>"
  ```
- **`beadfinder:research` (AFK)**: For empirical codebase or library investigation.
  ```bash
  bd create "Research: <Technical Uncertainty>" -t task -p 2 \
    --parent <map-epic-id> --label phase:plan --label beadfinder:research \
    -d "Objective: <Investigation goal>\nPointers: <Relevant repo files or external docs>"
  ```
- **`beadfinder:prototype` (HITL)**: For throwaway spikes evaluating ergonomics or UI.
  ```bash
  bd create "Spike: <Behavior or UI Prototype>" -t task -p 2 \
    --parent <map-epic-id> --label phase:plan --label beadfinder:prototype \
    -d "Spike Goal: <What behavior to test>\nArtifact: <Disposable script or mockup>"
  ```

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
2. **Claim the Bead**:
   ```bash
   bd update <bead-id> --claim
   ```
3. **Resolve Based on Type**:
   - For `beadfinder:grill`: Delegate to `/beadfinder-grill` or run focused trade-off dialogue.
   - For `beadfinder:research`: Inspect repo files, test dependencies, and formulate findings.
   - For `beadfinder:prototype`: Write a self-contained throwaway spike script to demonstrate behavior.
4. **Fog Excavation (The Fog Sieve)**:
   If resolving this bead exposes new sub-decisions, create new beads immediately:
   ```bash
   bd create "Decision: <New Emergent Question>" --parent <map-epic-id> \
     --label phase:plan --label wayfinder:grilling \
     --deps discovered-from:<current-bead-id>
   ```
5. **Close Bead & Store Memory**:
   ```bash
   bd close <bead-id> "Resolution: <Concise rationale and locked decision>"
   bd remember "Decision [<Pillar>]: <Locked rule or invariant>"
   ```
### 6. Terminal Handoff
When `bd ready --label phase:plan` returns empty and all decision beads under the map epic are closed:
1. Run `/beadfinder-to-spec` to compile all closed decisions into `SPEC.md`.
2. Run `/beadfinder-to-tickets` to generate the fine-grained implementation graph.
3. Close the root map epic:
   ```bash
   bd close <map-epic-id> "All architectural decisions locked. Specification compiled."
   ```

---

## Gotchas
- **Do Not Answer Grilling Questions Autonomously**: HITL beads require user collaboration; never invent user preferences.
- **Do Not Implement Code in Tasks**: `beadfinder:task` is strictly for unblocking research (e.g. provisioning keys), never early feature code.
- **Never Skip Pillars**: Always check if authentication, error handling, and migrations apply before declaring planning complete.
