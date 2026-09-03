# ARCHITECTURE.md — beadfinder phase machine

v0.7.0. This is the normative design. SKILL.md is the operator's view; this file is the
machine underneath it. Everything referenced elsewhere (`references/review-rubric.md`
§ARCHITECTURE.md, `references/micro-ticket-templates.md`, `companions/*`) points here.

Philosophy is unchanged from v0.6: **chart decisions as beads, do not build in planning
sessions, resolve fog across focused sessions, and let a read-only reviewer with anchored
scores gate every unit of work.** What changed is that the single "Terminal Handoff"
(plan → build) is now a three-gate relay: plan → requirements → design → build.

---

## 1. The phase machine

Five phases. A bead is born into one phase and either closes there or moves along the
handoff edges below. Exactly one `phase:*` label per bead at any time.

```
                ┌──────────────────────────────────────────────────────────┐
                │                destination epic (phase:plan)             │
                └──────────────────────────────────────────────────────────┘
   decision beads (grill / research / prototype) resolved one per session
                                        │
                        all plan beads closed (zero fog)
                                        ▼
   ┌──────────────┐  locked    ┌───────────────┐ ARCHITECTURE.md   ┌──────────────┐
   │  PLAN        │ decisions ─▶│ REQUIREMENTS  │──────────▶┌───────│  DESIGN      │
   │ phase:plan   │            │ phase:require.│  + IMPL.  │       │ phase:design │
   │ persona:     │           │ persona:     │  MENTS.md │       │ persona:     │
   │ wayfind      │           │ research     │           ▼       │ architect    │
   └──────────────┘           └──────────────┘  /beadfinder-to- └──────────────┘
                                                tickets creates        │
                                                the build DAG          │ ticket DAG
                                                                       ▼
   ┌──────────────┐  review-submit.sh   ┌──────────────┐  review-verdict.sh --pass
   │  IMPLEMENT   │────────────────────▶│   REVIEW     │──────────────────────────▶ closed
   │ phase:imple- │◀────────────────────│ phase:review │
   │ ment         │  review-verdict.sh  │ persona:     │
   │ persona:     │        --fail       │ review       │
   │ implementation│                    └──────────────┘
   └──────────────┘
```

### Phase contracts

| Phase | Label | Persona label | Script persona | Worker | Reads | Writes (artifact) | Exit gate |
|---|---|---|---|---|---|---|---|
| Plan | `phase:plan` | `wayfind` | `wayfinder` | wayfinder parent (HITL) + spawned research | 10 Pillars, user answers | decision beads, Decisions-so-far | `bd ready --label phase:plan` empty under the map epic |
| Requirements | `phase:requirements` | `research` | `research` | spawned AFK research + product (HITL) | closed plan beads, `bd remember` memory, repo | SPEC.md via `/beadfinder-to-spec` | to-spec zero-open-bead gate passes; SPEC quality checklist passes |
| Design | `phase:design` | `architect` | `architect` | blocking `architect` subagents | SPEC.md, codebase, research beads | ARCHITECTURE.md + IMPLEMENTATION.md, then ticket DAG via `/beadfinder-to-tickets` | artifacts written; build frontier non-empty |
| Implement | `phase:implement` | `implementation` | `implementer` | blocking `implementer` subagents | ticket contract, ARCHITECTURE.md, SPEC.md | code + tests | `scripts/review-submit.sh` |
| Review | `phase:review` | `review` | `reviewer` | blocking `reviewer` subagents | diff, ticket contract | review verdict | all three scores ≥ 8, else fail back to implement |

### Transitions (the T-numbers are cited by script headers and the rubric)

| # | Transition | Owner | Mechanic | Emits |
|---|---|---|---|---|
| G1 | plan drained → requirements slice | wayfinder | creates `beadfinder:slice` epic with `phase:requirements`; `/beadfinder-to-spec` compiles SPEC.md | requirements slice epic |
| G2 | SPEC validated → design slice | wayfinder | creates design slice epic (`phase:design`); blocking `architect` workers write ARCHITECTURE.md / IMPLEMENTATION.md sections | design slice epic |
| T4 | design artifacts done → build DAG | wayfinder | `/beadfinder-to-tickets` creates `phase:implement` + `implementation` beads under the build slice | slice epic + build beads |
| T1 | build done → review queue | implementer | `scripts/review-submit.sh <id>` | comment "Submitted for review" with evidence summary |
| T2 | review pass → closed | reviewer | `bd close <id> --reason "Review PASS: quality X/10, correctness Y/10, pillars Z/10. <gist>"` | close reason (scores mandatory); wayfinder appends gist via `append-decision.py` |
| T3 | review fail → rework | reviewer | `scripts/review-verdict.sh <id> --fail --reason "<scores + ranked issues>"` — the script posts the reason as the bead's comment, then swaps labels back | comment "Review FAIL" (posted by the script) |

Unlock semantics: downstream DAG beads unblock only when the upstream bead is **closed
by review pass** (T2) — never on implementer finish. Reviewed code is what downstream
builds on. Phase gates G1/G2/T4 are artifact-gated, not score-gated: the artifact's
checklist is the gate.

Rules that hold across all phases:

1. **Phase labels are set at creation and move only via the handoff scripts.**
   Hand-rolled `bd update` label swaps strand work. The only two legal moves are
   `phase:implement → phase:review` (`review-submit.sh`) and
   `phase:review → phase:implement` (`review-verdict.sh --fail`).
2. **Phase and persona labels move together, atomically**, and the handoff scripts
   **unassign + reopen** the bead so `bd ready --unassigned` remains the single
   discovery mechanism for the next worker. The scripts verify the bead's current
   label pair before swapping and exit non-zero otherwise (idempotent-safe).
3. **Slice/destination epics keep their phase label and are never submitted for
   review** — review is per bead, never per epic (no separate review tickets).
4. **The comment stream is the event log.** bd comments carry submit notices (T1),
   fail reports (T3), evidence citations; the close reason is the pass record (T2).
5. **Requirements and design beads close in place** — they are decision/analysis work,
   not build work; there is no review handoff for them. Their artifact (SPEC.md,
   ARCHITECTURE.md/IMPLEMENTATION.md) is the deliverable, and the phase exit gate is the
   artifact's quality checklist.
6. **Where `/beadfinder-to-spec` belongs: Requirements.** SPEC.md *is* the Software
   Requirements Specification — it compiles locked plan decisions plus requirement beads
   into functional and non-functional requirements. It does not belong in design.
7. **Where `/beadfinder-to-tickets` belongs: the Design→Build boundary.** The ticket DAG
   is the last design artifact; build consumes it. Implementers request emergent tickets
   via `discovered-from`; only the wayfinder runs the slicer, and it never re-slices
   settled work.
8. **Human-in-the-loop never leaves the parent** in any phase; the `hitl` mode label
   marks such beads. `product` answers requirement/UAT questions in the wayfinder
   session; AFK `research` (the `afk` label) is the only non-blocking spawn.
9. **Fresh status, not chat memory** — same as v0.6; `bd show <id> --json` before every
   claim/close.

### Fog plumbing (unchanged rule, now per-phase)

Fog excavated in any phase is created immediately as a child bead **labeled with the
current phase** and `--deps discovered-from:<current-bead-id>`. Grill fog in plan stays
`phase:plan`; a design hole discovered mid-build gets `needs-design` and stops (v0.6 rule,
retained); a missing requirement discovered in design becomes a `phase:requirements` bead.

---

## 2. Label vocabulary (single source of truth)

| Concept | Values | Set by |
|---|---|---|
| Phase label | `phase:plan` `phase:requirements` `phase:design` `phase:implement` `phase:review` | creation; handoff scripts for implement↔review |
| Persona (role) label | `wayfind` `research` `architect` `implementation` `review` `product` | creation; `review-submit.sh` for review |
| Mode label | `hitl` `afk` | creation |
| Graph labels | `beadfinder:destination` `beadfinder:slice` `beadfinder:grill` `beadfinder:research` `beadfinder:prototype` | creation |
| Script persona arg | `wayfinder` `research` `architect` `implementer` `reviewer` `product` | operator |

Mapping (script arg → role label): `wayfinder→wayfind`, `research→research`,
`architect→architect`, `implementer→implementation`, `reviewer→review`,
`product→product`.

**Backward compatibility:** beads labeled `wayfinder` or `architecture` (v0.6 role labels)
are still routed by the hook layer (`personaFromRoleLabel` keeps both aliases), but new
beads must use the v0.7 labels. Migrate stale open beads with
`bd update <id> --remove-label architecture --add-label architect` (same for
`wayfinder→wayfind`). Closed history stays as-is; do not rewrite closed beads.

**Slice epics per phase.** A destination epic (`beadfinder:destination`, `phase:plan`)
holds plan decision beads directly. Requirements, design, and implement work gets its own
`beadfinder:slice` epic carrying that phase's label, so `session-boot.sh` lists live work
per phase and `frontier.sh --parent <slice>` scopes queues.

---

## 3. Subsystem folders

One owner per folder. Builders never edit outside their folder; core files
(SKILL.md, ARCHITECTURE.md, README.md, docs/STATUS.json) change only through the
integrator. The hook layer (`paths.ts personaWall`) encodes the same walls.

| Folder | Subsystem | Owner persona | Depends on | Never touches |
|---|---|---|---|---|
| `scripts/` | bd queue plumbing: session-boot, frontier, claim-next, review-submit, review-verdict, verify-review-flow, append-decision, debug-log | implementation | `bd` CLI, jq, python3 | any prose/docs; hook TS |
| `references/` | contracts: personas, phase templates, review rubric, pillars, bd ops | architect | nothing (leaf) | scripts, companions |
| `companions/` | the seven sub-skills (grill, research, to-spec, to-tickets, implement, review, debug) | architect | references/, scripts/ by path | scripts/, adapters/ |
| `agents/` | harness-neutral persona contracts (wayfinder, architect, implementer, reviewer, product) | architect | references/personas.md | harness-specific flags |
| `adapters/opencode/` | OpenCode agents, plugin (hooks), /beadfinder command | implementation | lib/ shared state; mirrors agents/ semantics | companions/, scripts/ |
| `adapters/ohmypi/` | Oh My Pi agents + extension (same hooks, OMP event API) | implementation | lib/ shared state; mirrors agents/ semantics | companions/, scripts/ |
| `docs/` | human + hook documentation (HOOKS.md, HOOKS-IMPLEMENTATION.md, harness-*.md) | architect | code as-is | code |
| `third_party/` | vendored upstreams | nobody (frozen) | — | everything |
| root | SKILL.md, ARCHITECTURE.md, README.md, IMPLEMENTATION.md, install.sh, LICENSE/NOTICE | integrator only | all | — |

`install.sh` is the packaging contract: it copies `SKILL.md` + `references/` + `scripts/`
as the `beadfinder` skill, each `companions/<name>` as its own skill, and the adapter
agents/plugin into the target harness. Any new file must be reachable through it.

---

## 4. Why this holds up (dry-runs played out)

1. **Heavy use / many sessions**: every queue is scoped `--parent <slice>` + persona label,
   so two sessions working requirements and design never see each other's beads. Claiming
   is atomic (`bd ready --claim`), so parallel builders cannot double-claim.
2. **A phase goes wrong**: artifacts gate phase exits. A bad SPEC fails to-spec's checklist
   and requirements stays open — fog cannot leak into design because design's input is a
   checklist-passed artifact, and implementers implement *only* the ticket contract
   (`needs-design` stop remains the escape hatch).
3. **A builder stalls or lies**: review is per-bead with re-run evidence; fail returns the
   bead to the implement queue and the loop has no cap. Nothing closes without three ≥ 8
   scores. Same for this repo's own overhaul (docs/STATUS.json records module scores).
4. **Label drift**: the hook layer maps role labels → personas in one function
   (`personaFromRoleLabel`); scripts map args → role labels in one `case` each. Two small
   tables, both updated in lockstep, both smoke-tested by `verify-review-flow.sh`.
5. **Old packs in the wild**: role-label aliases keep v0.6 beads routable; the handoff
   scripts are unchanged in shape, so an old install degrades gracefully.

## 5. Failure isolation & safety

- **Reviewer is read-only**: persona contracts + harness permissions (`edit: deny`) +
  plugin `personaWall` block product edits. A broken or hostile reviewer can score and
  close, nothing else.
- **Implementer cannot self-pass**: `bd close` of a bead carrying `phase:review`/`review`
  by an implementer persona is rejected by the plugin close-guard; reviewer closes must
  record all three scores.
- **Label drift cannot strand work**: the only writers of the phase/persona swap are the
  two handoff scripts, which verify the bead's current labels before swapping and exit
  non-zero with a JSON error otherwise.
- **Empty frontier stops, never invents**: `claim-next.sh` exit 2 ⇒ worker reports and
  stops; the plugin's `empty-frontier-stop` gate blocks product writes after it.
- **Claim loss is survivable**: `bd ready` excludes stale claims; yield-on-stop releases
  claims so one crashed session never blocks the DAG.
- `review-submit.sh` / `review-verdict.sh` validate the bead's exact label pair before
  moving it; wrong state = JSON error, exit 1, no mutation.
- Kill switch `BEADFINDER_HOOKS=off`; debug trail via the `beadfinder-debug` companion.
- Tracker dir is `.beads/` — never glob `beads/`.
- **One broken module never takes the pack down**: hooks fail soft; scripts fail loud
  with non-zero exits; each subsystem folder is independently installable and
  independently reviewable.

## 6. Performance-minded design

- Every transition is **O(1) bd calls**: one `bd show`, one `bd update`/`bd close`. No
  polling, no scans over all issues, no N+1 label queries.
- `session-boot.sh` emits **one** JSON document per section; workers read the frontier
  with `claim-next.sh`/`frontier.sh` (single `bd ready --label … --json` query).
- The plugin never blocks the turn on bd: state is a small JSON sidecar
  (`.opencode/beadfinder/state.json`), snapshots throttled.
- Review loops are bounded by artifact size, not repo size: the reviewer reads the
  ticket's target files + diff, not the whole tree.
- `verify-review-flow.sh` runs against a **scratch bd store in a temp directory**
  (`bd init --quiet` + sibling scripts invoked with that cwd): full T1→T3→T1→T2 loop
  coverage including unassign/reopen, wrong-state rejections, and pass-reason score
  validation — zero side effects on the host repo.

## 7. Scoring the machine itself

The review gauntlet is not just for downstream projects; this pack is maintained with it.
Module changes are scored per `references/review-rubric.md` (quality / correctness /
pillar adherence, pass = all ≥ 8) and persisted to `docs/STATUS.json` so an interrupted
overhaul resumes at the weakest module. Never inflate scores; failed rounds stay on the
record.
