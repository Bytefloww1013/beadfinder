# Beadfinder 0.2

Pack root: `artifacts/beadfinder/` locally. Published at https://github.com/Bytefloww1013/beadfinder

## Locked decisions

1. Split by slice. Destination epic stays open.
2. HITL = label `hitl` + ask in the parent. No gates yet.
3. Five personas. Wayfinder is the only primary. Workers are sub-agents. HITL does not background.
4. Skill home unchanged: install into project or `~/.omp` / `~/.config/opencode`. State stays in per-repo `.beads`.
5. No formulas.
6. Reviewer cannot edit product code.
7. Name is `beadfinder`.

## Tree

```
beadfinder/
  SKILL.md                      orchestrator
  scripts/                      frontier, claim-next, session-boot, append-decision
  companions/grill|
            research|to-spec    copy out to skills/<name>/
  agents/                       harness-neutral
  adapters/opencode|ohmypi
  references/
  third_party/                  Beads and Wayfinder credit
```

## What 0.2 is not

- Not smoke-tested against a live `bd`.
- Not an installer script.
- OMP reviewer tool allowlist may need renaming per OMP build.
