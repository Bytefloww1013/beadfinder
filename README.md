# Beadfinder

v0.3.0 — a Beads-native wayfinding pack for multi-session agent work.

Charts a destination epic, settles one frontier ticket per session, and cuts an execute slice when a plan slice is decided. Personas (`wayfinder`, `architect`, `implementer`, `reviewer`, `product`) hand off through `bd ready` and atomic `--claim`.

This is not Beads and not Matt Pocock’s Wayfinder. See [NOTICE.md](NOTICE.md).

## Install

Needs the Beads CLI (`bd`) on `PATH`.

```bash
git clone https://github.com/Bytefloww1013/beadfinder.git
cd beadfinder

# Do not use sudo. Writes only under this repo or $HOME.

# Oh My Pi, this project
bash install.sh --omp

# Oh My Pi, every project
bash install.sh --omp --global

# OpenCode, this project
bash install.sh --opencode

# OpenCode, every project
bash install.sh --opencode --global

# Oh My Pi plus debug logging (writes <target>/.omp/beadfinder-debug.log)
bash install.sh --omp --debug
```

`install.sh` is checked in as a normal file (`100644`), so `./install.sh` can fail with permission denied. `bash install.sh` does not need the execute bit.

`--omp` writes `.omp/skills` + `.omp/agents` + `.omp/extensions/beadfinder` (or `~/.omp/agent` with `--global`).
`--opencode` writes `.opencode/skills` + `.opencode/agents` (or `~/.config/opencode` with `--global`). OpenCode hooks are not shipped yet.

Then in the **target project** (the repo you will wayfind):

1. `bd init` if `.beads` is missing.
2. Append [AGENTS.md.snippet](AGENTS.md.snippet) to that project’s `AGENTS.md`.
3. Start the `wayfinder` agent. It autoloads `beadfinder` and can spawn `architect`, `implementer`, `reviewer`, and `product`.

HITL grill stays in the wayfinder session. Do not background a grill ticket. Reviewer is read-only.

OMP installs a policy extension under `.omp/extensions/beadfinder/`. Hook behavior: [docs/HOOKS.md](docs/HOOKS.md). Implementer notes: [docs/HOOKS-IMPLEMENTATION.md](docs/HOOKS-IMPLEMENTATION.md). OpenCode hooks are not in this release.

Suggested Oh My Pi roles: wayfinder and architect `@plan`, implementer `@default`, reviewer `@review`.

## Layout

```
install.sh               --omp / --opencode copier
SKILL.md                 orchestrator
scripts/                 frontier, claim-next, session-boot, append-decision, debug-log
companions/              grill, research, to-spec, beadfinder-debug
agents/                  harness-neutral persona contracts
adapters/                OpenCode agents; Oh My Pi agents + extensions
docs/                    hook behavior + implementer plan
references/
third_party/
```

## License

MIT. Upstream Beads and Wayfinder remain MIT under their own copyright holders.
