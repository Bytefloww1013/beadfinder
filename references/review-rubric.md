# Review rubric

Deterministic scoring for the `phase:review` gauntlet (`ARCHITECTURE.md` §7). Reviewer
skills and agents cite this file, not personal judgment: same diff, same scores (±1).

## Dimensions

Three scores, integer 1–10 each — integers only, no halves, no averaging:

| Dimension | One line |
|---|---|
| Quality | Structure, readability, no reinvented wheels, error paths. |
| Correctness | Proven by actually running the ticket's verification command (tests, script exit codes), or by screenshot/console-output analysis for visual work. |
| Pillar adherence | Conformance to locked decisions — the 10 Architectural Pillars (`architectural-pillars.md`) plus the ticket's stated contract. |

## Anchors — all dimensions

| Score | Anchor |
|---|---|
| 1 | Broken / wrong / no evidence. |
| 3–4 | Serious gaps: core requirement unmet or a major path broken. |
| 5 | Programmer-art: works incidentally, fails edge cases, unverified claims. |
| 6–7 | Good indie: works, minor gaps in edge/error handling. |
| 8 | Correct with minor non-blocking nitpicks — the pass bar. |
| 9 | Excellent, one nit. |
| 10 | Perfect, no issues found. |

## Pass rule

**Pass = all three ≥ 8.** Any dimension < 8 is FAIL overall, whatever the other two scored.

## Evidence policy

- **No evidence, no score.** A score is invalid unless the review comment cites the exact
  command run + decisive output tail, or a screenshot path + what it shows.
- Re-run the implementer's verification yourself. Never score from the submit comment alone.
- Uncorroborated scores must be retracted and re-issued with evidence.

## Verdict formats

PASS — post the scores with evidence, then close (the close reason is the pass record):

```bash
bd close <id> --reason "Review PASS: quality X/10, correctness Y/10, pillars Z/10. <gist>"
# or: scripts/review-verdict.sh <id> --pass --reason "Review PASS: …"
```

FAIL — pass the whole report as the reason (`--reason` is required); the script posts it as the
bead's FAIL comment and returns the bead to implement. One post, from the script — do not
pre-post a separate fail comment:

```bash
scripts/review-verdict.sh <id> --fail --reason "<FAIL report: quality/correctness/pillars scores + ranked issues>"
```

Report body (the `--reason` text):

```markdown
Review FAIL

- quality: X/10 — <one-line why>
- correctness: Y/10 — <one-line why>
- pillars: Z/10 — <one-line why>

Ranked issues (worst first):
1. [blocker] <file> — <what> — <why it blocks the score>
2. [major] <file> — <what> — <why it blocks the score>
3. [nit] <file> — <what> — <why it blocks the score>

Evidence: `<command>` → <decisive output tail>  |  screenshot <path> — <what it shows>
```

## Integrity

Scores are never inflated, never smoothed; failed rounds stay on the record — bead comments are the audit trail.
