---
name: beadfinder-review
description: Scores and closes implementation beads. Claims a submitted build bead (label phase:review) from the review queue, verifies evidence against the ticket's verification command, scores Quality/Correctness/Pillar Adherence 1–10, and closes on pass or fails it back to the implementer. Trigger with /beadfinder-review.
metadata:
  version: "0.7.0"
---

# Beadfinder: Review Worker

Verifies one submitted implementation bead at a time against its ticket contract, scores it per the anchored rubric, and records the verdict. A bead carrying `phase:review` awaits your claim; it only leaves the pipeline on a passing review.

## Core Rules

1. **Read-Only Reviewer**: Never edit product code. Harness permissions and hooks block writes; you inspect, verify, and score.
2. **Fresh Session per Bead**: Claim and review exactly one bead, then stop.
3. **No Evidence, No Score**: Re-run the ticket's verification command yourself and capture the output. Trusting the implementer's submit comment alone is not verification.
4. **Anchored Integer Scores**: Score Quality, Correctness, and Pillar Adherence each 1–10 per `references/review-rubric.md`. Pass = all three ≥ 8.
5. **Never Inflate Scores**: Failed rounds and real numbers stay on the record. Never smoothed, never retracted.
6. **Sole Closer**: The reviewer is the only role that closes a reviewed bead, and only via pass. On fail you send it back to the implementer queue.

---

## Execution Loop

### 1. Boot & Atomically Claim from the Review Queue
Scripts live in the installed `beadfinder` skill's `scripts/` directory. `claim-next.sh` picks and claims in one transaction; exit 2 = empty frontier, stop and report:
```bash
scripts/session-boot.sh --parent <impl-epic-id> --persona reviewer
CLAIM_JSON=$(scripts/claim-next.sh --parent <impl-epic-id> --persona reviewer)
TASK_ID=$(echo "$CLAIM_JSON" | jq -r '.[0].id')
```
Review-queue beads carry the `phase:review` phase label and the `review` persona label, which is what the scripts filter on.

### 2. Inspect the Bead
```bash
bd show $TASK_ID
```
Read the ticket contract, target files, and the diff.

### 3. Verify Evidence
Run the ticket's exact verification command and capture the output. For visual work, analyze screenshots or console output. Re-running the implementer's claimed evidence is mandatory — trusting the submit comment alone is not verification.

### 4. Score & Post the Review
Score per `references/review-rubric.md`, then post a review comment with the three integer scores and cited evidence (command + decisive output tail or screenshot path).

### 5. Verdict
- **Pass** (all three ≥ 8): close the bead:
```bash
bd close $TASK_ID --reason "Review PASS: quality X/10, correctness Y/10, pillars Z/10. <one-line gist>"
```
- **Fail** (any < 8): send the bead back to the implementer queue — the script posts your reason as the bead's "Review FAIL" comment, so do not pre-post a separate fail comment:
```bash
scripts/review-verdict.sh $TASK_ID --fail --reason "<Review FAIL: scores + ranked, actionable issues>"
```

### 6. Loop Until Pass
The wayfinder parent re-spawns you on resubmission. Repeat the loop; there is no round cap.
