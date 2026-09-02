# Beadfinder Architecture — the `phase:review` pipeline

v0.6.0. This document governs the pack itself: how a finished implementation bead
moves from the implementer to the reviewer, how review is scored, and which file
owns which rule. No file may describe a different flow than this one.

## 1. Subsystems (one folder each)

| Folder | Owns | May not |
|---|---|---|
| `scripts/` | Executable handoff mechanics: `frontier.sh`, `claim-next.sh`, `session-boot.sh`, `append-decision.py`, `review-submit.sh`, `review-verdict.sh`, `debug-log.py` | Define policy (who scores what) |
| `companions/` | Per-worker skill instructions: `beadfinder-review`, `beadfinder-implement`, `beadfinder-grill`, `beadfinder-research`, `beadfinder-to-spec`, `beadfinder-to-tickets`, `beadfinder-debug` | Run bd writes outside their own flow |
| `agents/` | Harness-neutral persona contracts (wayfinder, architect, implementer, reviewer, product) | Script mechanics |
| `adapters/` | Per-harness agents (`opencode/`, `ohmypi/`), the OpenCode plugin, the OMP extension: policy enforcement of the contracts | New policy not already in `agents/` |
| `references/` | The rubric and taxonomies: `review-rubric.md`, `architectural-pillars.md`, `personas.md`, `beads-ops.md`, `micro-ticket-templates.md`, harness notes | Track state |
| `docs/` | Human references: `HOOKS.md`, `HOOKS-IMPLEMENTATION.md`, gauntlet state in `STATUS.json` | Define new transitions |
| root | `SKILL.md` (orchestrator), `README.md`, `install.sh`, `AGENTS.md.snippet`, `IMPLEMENTATION.md`, `CLAUDE.md`, this file | — |

`install.sh` is the seam: it must copy every skill, agent, script, and adapter file
this document names. A subsystem is broken if `install.sh --opencode` does not ship it.

## 2. Shared data model — beads are the only state

All workflow state lives in the local Beads store (`.beads/`). There is no other
database. A build bead's state is fully determined by two label sets:

| State | Phase label | Persona label | Status | Assignee |
|---|---|---|---|---|
| Building / rework | `phase:implement` | `implementation` | `open` | — (claim to take) |
| Awaiting / under review | `phase:review` | `review` | `open` | — (claim to take) |
| Passed | *(closed)* | `review` | `closed` | reviewer |

Invariants:
- A build bead carries **exactly one** `phase:*` label at any moment. `phase:plan`
  is reserved for planning beads and never appears on build work.
- Phase and persona labels move **together, atomically, only via the handoff scripts**
  (`review-submit.sh`, `review-verdict.sh`). Hand-rolled `bd update` label swaps are a
  policy violation (label drift = invisible work).
- Both handoff scripts unassign and reopen the bead so `bd ready` (`--unassigned`,
  excludes `in_progress`) is the single discovery mechanism for the next worker.
- The epic keeps `phase:implement`; it is never submitted for review. Review scores
  and verdicts are recorded in the bead's comments and close reason — the comment
  stream is the event log.

## 3. Phase machine (transitions, owners, mechanics)

```
                    bd create (to-tickets)
 phase:plan  ──►  [phase:implement + implementation]  (open, unassigned)
                          │  ▲
          implementer     │  │ fail verdict
          claims+builds   │  │ (ranked issues, scores)
                          ▼  │
                    [phase:implement + implementation] (in_progress, claimed)
                          │
                          │ review-submit.sh   (implementer: done, evidence noted)
                          ▼
                    [phase:review + review]  (open, unassigned)
                          │
          reviewer        │ claims, verifies evidence, scores 3×1–10
                          ▼
              ┌── all ≥ 8 ────┴──── any < 8 ──┐
              ▼                              ▼
        bd close (reviewer only)      review-verdict.sh --fail
        reason = scores + gist        → back to phase:implement (loop, no cap)
```

| # | Transition | Owner | Mechanic | Emits |
|---|---|---|---|---|
| T1 | build done → review queue | implementer | `scripts/review-submit.sh <id>` | comment "Submitted for review" with evidence summary |
| T2 | review pass → closed | reviewer | `bd close <id> --reason "Review PASS: quality X/10, correctness Y/10, pillars Z/10. <gist>"` | close reason (scores are mandatory text); wayfinder appends gist via `append-decision.py` |
| T3 | review fail → rework | reviewer | posts nothing by hand — `scripts/review-verdict.sh <id> --fail --reason "<scores + ranked issues>"` (the script posts the reason as the bead's comment, then swaps labels back) | comment "Review FAIL" with per-dimension scores, ranked issues (posted by the script) |
| T4 | plan → build | wayfinder | `beadfinder-to-tickets` (creates beads in `phase:implement`) | slice epic |

Unlock semantics: downstream DAG beads unblock only when the upstream bead is
**closed by review pass** (T2) — never on implementer finish. Reviewed code is what
downstream builds on.

## 4. Scoring — determinism

Three dimensions, integer 1–10 each, from the anchored rubric in
`references/review-rubric.md`:

1. **Quality** — structure, readability, no reinvented wheels, error paths.
2. **Correctness** — proven by the ticket's verification command actually run
   (tests, script exit codes) or by screenshot/console-output analysis for visual work.
3. **Pillar adherence** — conformance to the architecture the decision beads locked
   (10 Pillars, `references/architectural-pillars.md`, plus the ticket's contract).

- **Pass = all three ≥ 8.** 8 means "correct with minor non-blocking nits".
- Anchors (1, 5, 8, 10) are fixed prose in the rubric so two reviewers score the same
  diff within ±1. Scores are integers; no averaging, no halves.
- **No evidence, no score.** A reviewer must cite the exact command run and paste the
  decisive output tail (or screenshot path) in the review comment. Uncorroborated
  scores are invalid and must be retracted.
- Scores are recorded verbatim in the comment and close reason. Never inflated,
  never smoothed; failed rounds stay in the record.

## 5. Event & emit policy

- **bd comments** are the only per-bead event stream: submit notice (T1), fail
  report with scores + ranked issues (T3, posted by `review-verdict.sh` from its
  `--reason`), evidence citations.
- **close reason** is the pass record (T2): must contain the three scores.
- **`append-decision.py`** appends the pass gist to the slice epic's "Decisions so far".
- **`bd remember`** stores cross-session invariants only (e.g. a rubric anchor
  ruling), never ticket state.
- **`docs/STATUS.json`** is the gauntlet ledger for meta-work on this pack: per-module
  scores, open issues, weakest module first. Regenerated each gauntlet round; beads
  remain the source of truth for ticket state.

## 6. Performance-minded design

- Every transition is **O(1) bd calls**: one `bd show`, one `bd update` (or `bd
  close`). No polling, no scans over all issues, no N+1 label queries.
- `session-boot.sh` emits **one** JSON document per section; reviewers read the
  frontier with `claim-next.sh`/`frontier.sh` (single `bd ready --label review …`
  query).
- The plugin never blocks the turn on bd: state is a small JSON sidecar
  (`.opencode/beadfinder/state.json`), snapshots are throttled (`REFRESH_MS`).
- Review loops are bounded by artifact size, not repo size: the reviewer reads the
  ticket's target files + diff, not the whole tree.

## 7. Failure isolation

- **Reviewer is read-only**: persona contracts + harness permissions (`edit: deny`)
  + plugin `personaWall` block product edits. A broken or hostile reviewer can score
  and close, nothing else.
- **Implementer cannot self-pass**: `bd close` of a bead carrying `phase:review`/
  `review` by an implementer persona is rejected by the plugin close-guard.
- **Label drift cannot strand work**: the only writers of the phase/persona swap are
  the two handoff scripts, which are idempotent-safe (they verify the bead's current
  labels before swapping and exit non-zero with a clear message otherwise).
- **Empty frontier stops, never invents**: `claim-next.sh` exit 2 ⇒ worker reports
  and stops; the plugin's `empty-frontier-stop` gate enforces it on product writes.
- **Claim loss is survivable**: `bd ready` excludes stale claims; yield-on-stop
  releases claims so one crashed session never blocks the DAG.
- **One broken module never takes the pack down**: hooks fail soft (kill switch
  `BEADFINDER_HOOKS=off`); scripts fail loud with non-zero exits and JSON errors on
  stderr; each subsystem folder is independently installable and independently
  reviewable.
