# Beadfinder

v0.6.0 — a Beads-native wayfinding pack for multi-session agent work.

Charts a destination epic, settles one frontier ticket per session, and cuts an execute slice when a plan slice is decided. Personas (`wayfinder`, `architect`, `implementer`, `reviewer`, `product`) hand off through `bd ready` and atomic `--claim`.

Every build bead goes through a review gauntlet: the implementer submits with `scripts/review-submit.sh` (bead moves `phase:implement` → `phase:review`), and a read-only reviewer re-runs the verification evidence, scores quality / correctness / pillar-adherence 1–10 per [references/review-rubric.md](references/review-rubric.md), and closes on pass (all three ≥ 8) or fails it back with ranked issues — looping until pass. The state machine lives in [ARCHITECTURE.md](ARCHITECTURE.md).

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

# OpenCode plus debug logging (writes <target>/.opencode/beadfinder-debug.log)
bash install.sh --opencode --debug
```

`install.sh` is checked in as a normal file (`100644`), so `./install.sh` can fail with permission denied. `bash install.sh` does not need the execute bit.

`--omp` writes `.omp/skills` + `.omp/agents` + `.omp/extensions/beadfinder` (or `~/.omp/agent` with `--global`).
`--opencode` writes `.opencode/skills` + `.opencode/agents` + `.opencode/plugins` + `.opencode/commands` (or `~/.config/opencode` with `--global`).

Then in the **target project** (the repo you will wayfind):

1. `bd init` if `.beads` is missing.
2. Start the `wayfinder` agent. It autoloads `beadfinder` and can spawn `architect`, `implementer`, `reviewer`, and `product`. In OpenCode, `/beadfinder` does this in one step: it starts the `wayfinder` agent in the current session and runs session boot.

OMP installs a policy extension under `.omp/extensions/beadfinder/`. OpenCode installs a plugin at `.opencode/plugins/beadfinder.ts` (auto-loaded). Hook behavior: [docs/HOOKS.md](docs/HOOKS.md). Implementer notes: [docs/HOOKS-IMPLEMENTATION.md](docs/HOOKS-IMPLEMENTATION.md). Restart the harness after install so hooks load.

Suggested Oh My Pi roles: wayfinder and architect `@plan`, implementer `@default`, reviewer `@review`.

OpenCode agents ship pre-wired: `wayfinder` may `task` only the four workers, and `reviewer` / `product` deny edits. The plugin enforces the same gates as the OMP extension (blocked tools, persona lock, yield-on-stop) via OpenCode events — see the event map in [docs/HOOKS.md](docs/HOOKS.md).

## Layout

```
install.sh               installation of the skill/plugin/hooks and other associated files (be sure to use the correct flags)
SKILL.md                 orchestrator
ARCHITECTURE.md          phase machine, scoring, failure isolation
scripts/                 frontier, claim-next, review-submit, review-verdict, verify-review-flow, session-boot, append-decision, debug-log
companions/              beadfinder-grill, beadfinder-research, beadfinder-to-spec, beadfinder-to-tickets, beadfinder-implement, beadfinder-review, beadfinder-debug
agents/                  harness-neutral persona contracts
adapters/                OpenCode agents + plugin; Oh My Pi agents + extensions
docs/                    hook behavior + implementer plan
references/              review rubric, pillars, personas, ops
third_party/
```

## License

MIT. Upstream Beads and Wayfinder remain MIT under their own copyright holders.
