---
name: beadfinder-implement
description: Deterministic implementation executor for Beads tasks. Claims and executes single unblocked tasks from bd ready label phase:implement using strict TDD, static verification, and submit-for-review handoff. Trigger with /beadfinder-implement.
metadata:
  version: "0.5.0"
---

# Beadfinder: Implementation Worker

Consumes granular implementation tasks from the Beads graph one at a time, enforcing Test-Driven Development (TDD) and clean session boundaries.

## Core Rules

1. **No Spec Redesign**: Implement strictly what is specified in the ticket. Never reopen settled architectural decisions.
2. **Fresh Session per Ticket**: Claim one ticket, execute it, run tests, submit for review, and stop.
3. **Strict TDD Rhythm**:
   - Write a failing test for the seam defined in the bead.
   - Implement the minimum code needed to pass the test.
   - Run typechecking and the full module test suite.
4. **Submit & Hand Off**: Closing the bead is the reviewer's act, not yours. The next micro-ticket unblocks when review passes, so build on reviewed code only.
5. **Spawned Blocking Worker**: You run as a blocking subagent spawned by wayfinder with the ticket id. File discovered work with `--deps discovered-from:<current-id>`, labelled `phase:implement`. You never close the bead you built — the reviewer closes it on a passing review. If you hit a design hole, add `needs-design` and stop.

---

## Execution Loop

### 1. Boot & Atomically Claim the Single Ready Task
Scripts live in the installed `beadfinder` skill's `scripts/` directory. `claim-next.sh` picks and claims in one transaction; exit 2 = empty frontier, stop and report:
```bash
scripts/session-boot.sh --parent <impl-epic-id> --persona implementer
CLAIM_JSON=$(scripts/claim-next.sh --parent <impl-epic-id> --persona implementer)
TASK_ID=$(echo "$CLAIM_JSON" | jq -r '.[0].id')
```
Tickets carry the `implementation` persona label, which is what the scripts filter on.

### 2. Inspect Task & Load Project Context
```bash
bd show $TASK_ID
bd prime
```

### 3. Implement via TDD
1. Create or update the test file specified in the bead.
2. Execute the verification test command and confirm failure.
3. Implement the feature logic in the target files.
4. Re-run the verification command and confirm it passes.
5. Run the repository typechecker and linter.

### 4. Submit for Review & Hand Off
```bash
scripts/review-submit.sh $TASK_ID --summary "<what changed + evidence: test command and result>"
```
The handoff script swaps the bead into the review queue and reopens it for the reviewer. Give the submit summary as a one-line gist: the wayfinder parent appends it to the implement epic's "Decisions so far" via `append-decision.py` after review passes.
