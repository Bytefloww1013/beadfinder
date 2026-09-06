# Oh My Pi adapter

Copy:

```
.omp/skills/beadfinder/
.omp/skills/grill/
.omp/skills/research/
.omp/skills/to-spec/
.omp/agents/*.md                 ← adapters/ohmypi/agents
.omp/extensions/beadfinder/      ← OMP policy hooks
.omp/skills/beadfinder-debug/    ← only with install.sh --debug
```

Global alternative: `~/.omp/agent/skills/` and `~/.omp/agent/agents/`.

Wayfinder frontmatter: `autoloadSkills: [beadfinder]`, `spawns: architect,implementer,reviewer,product`.

Reviewer omits write/edit tools. HITL stays in the parent; do not task-tool a grill ticket into the background.

Suggested roles: wayfinder/architect `@plan`, implementer `@default`, reviewer `@review`.

`--debug` turns on JSONL logging at `<repo>/.omp/beadfinder-debug.log`. If the extension is copied but never fires, add `{ "extensions": [".omp/extensions/beadfinder"] }` to `.omp/settings.json`. Kill switch: `BEADFINDER_HOOKS=off`. See docs/HOOKS.md.
---
