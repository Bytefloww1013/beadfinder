# Beadfinder 0.7.0

Pack root: this repo.

## Locked decisions

1. Split by slice. Destination epic stays open, period — the close-guard forbids closing destinations; completion is recorded as a comment on the map epic.
2. Human-in-the-loop = label `hitl` + ask in the parent. Hooks may block a background spawn. They are not Beads gates.
3. Six personas. Wayfinder is the only primary. Workers are sub-agents: `architect`, `research` (the only non-blocking child), `implementer`, `reviewer`, `product`. Human-in-the-loop does not background.
4. Five-phase pipeline (ARCHITECTURE.md §1): plan (`phase:plan`/`wayfind`) → requirements (`phase:requirements`/`research`) → design (`phase:design`/`architect`) → implement (`phase:implement`/`implementation`) → review (`phase:review`/`review`). Exactly one `phase:*` label per bead; labels move only via the handoff scripts; requirements and design beads close in place (artifact = deliverable).
5. `/beadfinder-to-spec` is the Requirements gate (G1): SPEC.md is the Software Requirements Specification, compiled from closed plan + requirements beads. `/beadfinder-to-tickets` is the Design→Build boundary (T4): consumes SPEC.md + ARCHITECTURE.md + IMPLEMENTATION.md, cuts the build DAG. Implementers never re-slice settled work.
6. Skill home unchanged: install into project or `~/.omp` / `~/.config/opencode`. State stays in per-repo `.beads`. Hook scratch state may live in per-repo `.omp/beadfinder/` or `.opencode/beadfinder/`.
7. No formulas.
8. Reviewer cannot edit product code. Hooks also block bash rewrites of product trees. Research gets the same product-file wall as product.
9. Name is `beadfinder`.
10. Hooks ship for Oh My Pi and OpenCode. Same gates; different event names.
11. Per-bead review gauntlet (see ARCHITECTURE.md §1, §7): `phase:implement` + `implementation` → implementer runs `scripts/review-submit.sh` → `phase:review` + `review` → reviewer scores quality/correctness/pillars 1–10 (`references/review-rubric.md`, pass = all ≥ 8, evidence mandatory) → close on pass, fail back with ranked issues. Loop until pass. Phase/persona labels move only via the handoff scripts; the reviewer is the only closer; downstream beads unblock on review pass.
12. No per-epic review ticket. Review is per build bead.
13. `bd create --parent` inherits labels unless `--no-inherit-labels` is passed. All child-bead creation passes it and sets labels explicitly. (Discovered the hard way: children of a destination epic inherited `beadfinder:destination` and could not be closed.)
14. Deprecated v0.6 role labels (`wayfinder`, `architecture`) stay routed by the hooks as aliases; new beads use `wayfind` / `architect` / `research` / `implementation` / `review` / `product`.
15. Script persona args: `wayfinder` `research` `architect` `implementer` `reviewer` `product`. Mapping table: ARCHITECTURE.md §2.

## Tree

```
beadfinder/
  SKILL.md
  ARCHITECTURE.md               phase machine + label vocabulary + scoring + failure isolation
  IMPLEMENTATION.md             this file
  scripts/                      frontier, claim-next, review-submit, review-verdict, verify-review-flow, session-boot, append-decision, debug-log
  companions/grill|research|to-spec|to-tickets|implement|review|beadfinder-debug
  agents/                       wayfinder, architect, research, implementer, reviewer, product
  adapters/opencode/agents
  adapters/opencode/plugins/    OpenCode policy plugin
  adapters/opencode/commands/
  adapters/ohmypi/agents
  adapters/ohmypi/extensions/beadfinder/
  docs/HOOKS.md                 human behavior reference
  docs/HOOKS-IMPLEMENTATION.md  agent working plan
  docs/STATUS.json              module gauntlet ledger (scores, open issues, weakest module first)
  references/                   review-rubric, architectural-pillars, personas, beads-ops, micro-ticket-templates
```

Install: `bash install.sh --omp` copies skills, agents, and the OMP extension. `bash install.sh --opencode` copies skills, agents, the plugin (`plugins/beadfinder.ts` + `plugins/beadfinder/lib`), and `/beadfinder`. `--debug` also copies `beadfinder-debug`. `install.sh` `chmod a+x` on copied `*.sh` so `session-boot.sh` can exec `frontier.sh`. Session boot lists live work with `--status open,in_progress` as **one** JSON document.

Verify the review pipeline anytime: `bash scripts/verify-review-flow.sh` (scratch bd store, zero side effects on this repo).

## What 0.7.0 still is not

- Not smoke-tested against every OMP build's extension loader. If hooks are silent, add `.omp/extensions/beadfinder` to `.omp/settings.json` `extensions`.
- OpenCode plugin is auto-loaded from `.opencode/plugins/*.ts`. Restart OpenCode after install.
- `bd ready --unassigned` / `--parent` still assumed from current Beads CLI docs.
- Requirements and design phases have no scripted handoff (they close in place by design); their gates are artifact checklists, not scripts.
