---
name: beadfinder-grill
description: Socratic trade-off interrogation and architectural grilling engine. Resolves beadfinder:grill decision beads by evaluating concrete options, surfacing edge cases, and locking decisions into Beads memory. Trigger with /beadfinder-grill or when working a grilling bead.
metadata:
  version: "0.7.0"
---

# Beadfinder: Socratic Decision Grilling

Performs deep Socratic trade-off interrogation on an active decision bead. It forces rigorous evaluation of options, identifies edge cases, and records the final architectural choice.

Grilling serves the plan, requirements, and design stages — trade-offs, requirement clarifications, and design choices all use the same structured options format.

## Core Rules

1. **One Decision at a Time**: Focus exclusively on the claimed bead. Do not derail into unrelated architectural topics.
2. **Present Structured Alternatives**: Never ask open-ended questions like *"How should we do this?"* Always present 2–3 concrete options with explicit trade-offs.
3. **Mandatory Trade-off Structure**: Every option must evaluate:
   - **Pros**: Speed, simplicity, type safety, scalability.
   - **Cons**: Complexity, operational cost, breaking changes.
   - **Failure Modes**: What happens when this option encounters extreme load or network partitions?
4. **Lock Invariant in Memory**: When the user picks a direction, capture the decision and store it using `bd remember`.
5. **Runs in the Parent**: This skill executes in the wayfinder session. Never spawn it into a background subagent — a child will answer for the human. Claim the bead by named id (`bd update <id> --claim`); never `claim-next.sh` on HITL queues.

---

## Grilling Workflow

### 1. Read Bead Context & Active Memory
```bash
bd show <bead-id>
bd prime
```

### 2. Format the Grilling Interrogation
Present the decision to the human using the following structure:

```markdown
### 🎯 Decision: [Bead Title]
**Pillar**: [e.g., Concurrency & State Mutation]
**Core Uncertainty**: [1-2 sentences on what must be locked]

---

#### Option A: [Name of Option A] (Recommended)
* **Mechanics**: [How it works]
* **Pros**: [Key benefits]
* **Cons / Costs**: [Trade-offs or dependencies]
* **Failure Behavior**: [How it handles errors/timeouts]

#### Option B: [Name of Option B]
* **Mechanics**: [How it works]
* **Pros**: [Key benefits]
* **Cons / Costs**: [Trade-offs]
* **Failure Behavior**: [How it handles errors/timeouts]

---

### ❓ Edge Case & Invariant Check
1. [Specific edge case question 1]
2. [Specific edge case question 2]

Which option aligns best with your goals, or should we refine the parameters?
```

### 3. Record Resolution & Spawn Fog
Once alignment is reached:
1. Close the bead:
   ```bash
   bd close <bead-id> --reason "Resolution: [Option chosen and brief justification]"
   ```
2. Store durable architectural memory:
   ```bash
   bd remember "Decision: [Module/Pillar] uses [Chosen Option]. Rule: [Invariant]."
   ```
3. Check for emergent questions. If the choice creates new dependencies, immediately create child beads:
   ```bash
   bd create "Decision: [Follow-up question]" --parent <map-epic-id> \
     --no-inherit-labels \
     --label phase:plan --label wayfind --label beadfinder:grill --label product --label hitl \
     --deps discovered-from:<bead-id>
   ```
   Use the CURRENT stage's label (`phase:plan`, `phase:requirements`, or `phase:design`) so fog stays in the stage where it was found. Non-plan stages: requirements fog takes the human-question set (`beadfinder:grill,phase:requirements,product,hitl`, per the beads-ops.md requirements question example) for human questions, or the requirements research set (`phase:requirements,research,afk`) for empirical questions; design fog takes `phase:design,architect`.
4. Append the decision to the map epic's "Decisions so far" bus. Scripts live in the installed `beadfinder` skill's `scripts/` directory:
   ```bash
   python3 <beadfinder-skill>/scripts/append-decision.py --epic <map-epic-id> \
     --title "[Bead Title]" --id <bead-id> --gist "[Chosen option, one line]"
   ```
