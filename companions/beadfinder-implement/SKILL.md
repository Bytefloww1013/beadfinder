---
name: beadfinder-implement
description: Deterministic implementation executor for Beads tasks. Claims and executes single unblocked tasks from bd ready label phase:implement using strict TDD, static verification, and automated closeout. Trigger with /beadfinder-implement.
metadata:
  version: "0.4.0"
---

# Beadfinder: Implementation Worker

Consumes granular implementation tasks from the Beads graph one at a time, enforcing Test-Driven Development (TDD) and clean session boundaries.

## Core Rules

1. **No Spec Redesign**: Implement strictly what is specified in the ticket. Never reopen settled architectural decisions.
2. **Fresh Session per Ticket**: Claim one ticket, execute it, run tests, commit, close it, and stop.
3. **Strict TDD Rhythm**:
   - Write a failing test for the seam defined in the bead.
   - Implement the minimum code needed to pass the test.
   - Run typechecking and the full module test suite.
4. **Close & Unlock**: Closing the bead automatically unblocks the next micro-ticket in the DAG.

---

## Execution Loop

### 1. Discover the Single Ready Task
```bash
TASK_ID=$(bd ready --label phase:implement --json | jq -r '.[0].id')
```

### 2. Claim the Task
```bash
bd update $TASK_ID --claim
```

### 3. Inspect Task & Load Project Context
```bash
bd show $TASK_ID
bd prime
```

### 4. Implement via TDD
1. Create or update the test file specified in the bead.
2. Execute the verification test command and confirm failure.
3. Implement the feature logic in the target files.
4. Re-run the verification command and confirm it passes.
5. Run the repository typechecker and linter.

### 5. Close Task & Hand Off
```bash
bd close $TASK_ID "Completed: Implemented slice according to contract. All tests passing."
```
