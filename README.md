# Beadfinder

v0.2.0 — a Beads-native wayfinding pack for multi-session agent work.

Charts a destination epic, settles one frontier ticket per session, and cuts an execute slice when a plan slice is decided. Personas (`wayfinder`, `architect`, `implementer`, `reviewer`, `product`) hand off through `bd ready` and atomic `--claim`.

This is not Beads and not Matt Pocock's Wayfinder. See [NOTICE.md](NOTICE.md).

## Install

Needs the Beads CLI (`bd`) on `PATH`. Then install skills and agents into the harness you use.

### Oh My Pi

Project-local (this repo only):

```bash
# from a clone of this pack
PACK="$PWD"

mkdir -p .omp/skills .omp/agents

# orchestrator + scripts + references
rm -rf .omp/skills/beadfinder
mkdir -p .omp/skills/beadfinder
cp SKILL.md .omp/skills/beadfinder/
cp -R scripts references .omp/skills/beadfinder/

# companions must be sibling skills, not nested under beadfinder
rm -rf .omp/skills/grill .omp/skills/research .omp/skills/to-spec
cp -R companions/grill    .omp/skills/grill
cp -R companions/research .omp/skills/research
cp -R companions/to-spec  .omp/skills/to-spec

# persona agents
cp adapters/ohmypi/agents/*.md .omp/agents/
```

Machine-wide (every Oh My Pi session):

```bash
PACK=/path/to/beadfinder
DEST="${HOME}/.omp/agent"

mkdir -p "$DEST/skills" "$DEST/agents"
mkdir -p "$DEST/skills/beadfinder"
cp "$PACK/SKILL.md" "$DEST/skills/beadfinder/"
cp -R "$PACK/scripts" "$PACK/references" "$DEST/skills/beadfinder/"
cp -R "$PACK/companions/grill"    "$DEST/skills/grill"
cp -R "$PACK/companions/research" "$DEST/skills/research"
cp -R "$PACK/companions/to-spec"  "$DEST/skills/to-spec"
cp "$PACK/adapters/ohmypi/agents/"*.md "$DEST/agents/"
```

Then in the **target project** (the repo you will wayfind, not this pack):

1. `bd init` if `.beads` is missing.
2. Append [AGENTS.md.snippet](AGENTS.md.snippet) to that project's `AGENTS.md`.
3. Start the `wayfinder` agent. It autoloads `beadfinder` and can spawn `architect`, `implementer`, `reviewer`, and `product`.

HITL grill stays in the wayfinder session. Do not background a grill ticket. Reviewer is read-only.

Suggested model roles: wayfinder and architect `@plan`, implementer `@default`, reviewer `@review`.

### OpenCode

Same layout under `.opencode/skills/` and `.opencode/agents/`, using `adapters/opencode/agents/` instead of the Oh My Pi adapters.

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
