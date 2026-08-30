# Beadfinder 0.3

Pack root: `artifacts/beadfinder/` (this repo).

## Locked decisions

1. Split by slice. Destination epic stays open.
2. HITL = label `hitl` + ask in the parent. Hooks may block a background spawn. They are not Beads gates.
3. Five personas. Wayfinder is the only primary. Workers are sub-agents. HITL does not background.
4. Skill home unchanged: install into project or `~/.omp` / `~/.config/opencode`. State stays in per-repo `.beads`. Hook scratch state may live in per-repo `.omp/beadfinder/`.
5. No formulas.
6. Reviewer cannot edit product code. OMP hooks also block bash rewrites of product trees.
7. Name is `beadfinder`.
8. Hooks ship for Oh My Pi first. OpenCode ports wait until the OMP set is thinned.

## Tree

```
beadfinder/
  SKILL.md
  scripts/                      frontier, claim-next, session-boot, append-decision, debug-log
  companions/grill|research|to-spec|beadfinder-debug
  agents/
  adapters/opencode/agents
  adapters/ohmypi/agents
  adapters/ohmypi/extensions/beadfinder/
  docs/HOOKS.md                 human behavior reference
  docs/HOOKS-IMPLEMENTATION.md  agent working plan
  references/
```

Install: `bash install.sh --omp` copies skills, agents, and the OMP extension. `--debug` also copies `beadfinder-debug`.

## What 0.3 still is not

- Not smoke-tested against every OMP build’s extension loader. If hooks are silent, add `.omp/extensions/beadfinder` to `.omp/settings.json` `extensions`.
- OpenCode hook pack not started.
- `bd ready --unassigned` / `--parent` still assumed from current Beads CLI docs.
---
