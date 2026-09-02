# Beadfinder 0.6.0

Pack root: this repo.

## Locked decisions

1. Split by slice. Destination epic stays open.
2. HITL = label `hitl` + ask in the parent. Hooks may block a background spawn. They are not Beads gates.
3. Five personas. Wayfinder is the only primary. Workers are sub-agents. HITL does not background.
4. Skill home unchanged: install into project or `~/.omp` / `~/.config/opencode`. State stays in per-repo `.beads`. Hook scratch state may live in per-repo `.omp/beadfinder/` or `.opencode/beadfinder/`.
5. No formulas.
6. Reviewer cannot edit product code. Hooks also block bash rewrites of product trees.
7. Name is `beadfinder`.
8. Hooks ship for Oh My Pi and OpenCode. Same gates; different event names.
9. Per-bead review gauntlet (see ARCHITECTURE.md): `phase:implement` + `implementation` → implementer runs `scripts/review-submit.sh` → `phase:review` + `review` → reviewer scores quality/correctness/pillars 1–10 (`references/review-rubric.md`, pass = all ≥ 8, evidence mandatory) → close on pass, fail back with ranked issues. Loop until pass. Phase/persona labels move only via the handoff scripts; the reviewer is the only closer; downstream beads unblock on review pass.
10. No per-epic review ticket. Review is per build bead.

## Tree

```
beadfinder/
  SKILL.md
  ARCHITECTURE.md               phase machine + scoring + failure isolation
  scripts/                      frontier, claim-next, review-submit, review-verdict, verify-review-flow, session-boot, append-decision, debug-log
  companions/grill|research|to-spec|to-tickets|implement|review|beadfinder-debug
  agents/
  adapters/opencode/agents
  adapters/opencode/plugins/    OpenCode policy plugin
  adapters/opencode/commands/
  adapters/ohmypi/agents
  adapters/ohmypi/extensions/beadfinder/
  docs/HOOKS.md                 human behavior reference
  docs/HOOKS-IMPLEMENTATION.md  agent working plan
  references/                   review-rubric, architectural-pillars, personas, beads-ops, ...
```

Install: `bash install.sh --omp` copies skills, agents, and the OMP extension. `bash install.sh --opencode` copies skills, agents, the plugin (`plugins/beadfinder.ts` + `plugins/beadfinder/lib`), and `/beadfinder`. `--debug` also copies `beadfinder-debug`. `install.sh` `chmod a+x` on copied `*.sh` so `session-boot.sh` can exec `frontier.sh`. Session boot lists live work with `--status open,in_progress` as **one** JSON document.

Verify the review pipeline anytime: `bash scripts/verify-review-flow.sh` (scratch bd store, 7 assertions, no side effects on this repo).

## What 0.6.0 still is not

- Not smoke-tested against every OMP build’s extension loader. If hooks are silent, add `.omp/extensions/beadfinder` to `.omp/settings.json` `extensions`.
- OpenCode plugin is auto-loaded from `.opencode/plugins/*.ts`. Restart OpenCode after install.
- `bd ready --unassigned` / `--parent` still assumed from current Beads CLI docs.
