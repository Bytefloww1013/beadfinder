# OpenCode adapter

Copy:

```
.opencode/skills/beadfinder/
.opencode/skills/beadfinder-grill|research|to-spec|to-tickets|implement
.opencode/agents/*.md              ← adapters/opencode/agents
.opencode/plugins/beadfinder.ts    ← plugin entry (auto-loaded)
.opencode/plugins/beadfinder/lib/  ← helpers; not auto-loaded
.opencode/commands/beadfinder.md   ← /beadfinder
.opencode/skills/beadfinder-debug/ ← only with install.sh --debug
```

Global alternative: `~/.config/opencode/{skills,agents,plugins,commands}/`.

Wayfinder `mode: all`. Workers `mode: subagent`. Reviewer and product `edit: deny`. Wayfinder may `task` only architect, implementer, reviewer, product.

OpenCode discovers plugins with `{plugin,plugins}/*.{ts,js}` — only the top-level `beadfinder.ts` is an entry. Kill switch: `BEADFINDER_HOOKS=off`. Debug log: `<repo>/.opencode/beadfinder-debug.log`. See docs/HOOKS.md.
