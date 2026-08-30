# Beadfinder

v0.2.0 — a Beads-native wayfinding pack for multi-session agent work.

Charts a destination epic, settles one frontier ticket per session, and cuts an execute slice when a plan slice is decided. Personas (`wayfinder`, `architect`, `implementer`, `reviewer`, `product`) hand off through `bd ready` and atomic `--claim`.

This is not Beads and not Matt Pocock's Wayfinder. See [NOTICE.md](NOTICE.md).

## Install

Needs the Beads CLI (`bd`) on `PATH`.

```bash
git clone https://github.com/Bytefloww1013/beadfinder.git
cd beadfinder

# Oh My Pi, this project
./install.sh --omp

# Oh My Pi, every project
./install.sh --omp --global

# OpenCode, this project
./install.sh --opencode

# OpenCode, every project
./install.sh --opencode --global
```

`--omp` writes `.omp/skills` + `.omp/agents` (or `~/.omp/agent` with `--global`).
`--opencode` writes `.opencode/skills` + `.opencode/agents` (or `~/.config/opencode` with `--global`).

Then in the **target project** (the repo you will wayfind):

1. `bd init` if `.beads` is missing.
2. Append [AGENTS.md.snippet](AGENTS.md.snippet) to that project's `AGENTS.md`.
3. Start the `wayfinder` agent. It autoloads `beadfinder` and can spawn `architect`, `implementer`, `reviewer`, and `product`.

HITL grill stays in the wayfinder session. Do not background a grill ticket. Reviewer is read-only.

Suggested Oh My Pi roles: wayfinder and architect `@plan`, implementer `@default`, reviewer `@review`.

## Layout

```
install.sh               --omp / --opencode copier
SKILL.md                 orchestrator
scripts/                 frontier, claim-next, session-boot, append-decision
companions/              grill, research, to-spec
agents/                  harness-neutral persona contracts
adapters/                OpenCode and Oh My Pi frontmatter
references/
third_party/
```

## License

MIT. Upstream Beads and Wayfinder remain MIT under their own copyright holders.
