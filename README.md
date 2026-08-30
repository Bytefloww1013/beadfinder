# Beadfinder

v0.2.0 — a Beads-native wayfinding pack for multi-session agent work.

Charts a destination epic, settles one frontier ticket per session, and cuts an execute slice when a plan slice is decided. Personas (`wayfinder`, `architect`, `implementer`, `reviewer`, `product`) hand off through `bd ready` and atomic `--claim`.

This is not Beads and not Matt Pocock's Wayfinder. See [NOTICE.md](NOTICE.md).

## Install

Needs the Beads CLI on `PATH`. Then copy into your harness:

```
.omp/skills/beadfinder/          # this directory minus companions/
.omp/skills/grill/               # companions/grill/
.omp/skills/research/
.omp/skills/to-spec/
.omp/agents/                     # adapters/ohmypi/agents/
```

OpenCode: same layout under `.opencode/skills/` and `.opencode/agents/` from `adapters/opencode/agents/`.

Paste `AGENTS.md.snippet` into the target repo's `AGENTS.md`.

## Layout

```
SKILL.md                 orchestrator
scripts/                 frontier, claim-next, session-boot, append-decision
companions/              grill, research, to-spec
agents/                  harness-neutral persona contracts
adapters/                OpenCode and Oh My Pi frontmatter
references/
third_party/             upstream licenses + Wayfinder snapshot
```

## License

MIT. Upstream Beads and Wayfinder remain MIT under their own copyright holders.
