# Cline adapter

Copy:

```
.cline/skills/beadfinder/
.cline/skills/beadfinder-grill|research|to-spec|to-tickets|implement|review
.cline/agents/*.{md,yaml}         ← adapters/cline/agents
.cline/plugins/beadfinder/        ← package.json, index.ts, lib/
.cline/skills/beadfinder-debug/   ← only with install.sh --debug
```

Global alternative: `~/.cline/{skills,agents,plugins}/`.

## Install

```bash
bash install.sh --cline
bash install.sh --cline --global
bash install.sh --cline --debug
```

## Agents Layout

Persona agents live in `.cline/agents/` (or `~/.cline/agents/` with `--global`). Both `.md` and `.yaml` definitions are installed:
- `wayfinder`: primary orchestrator (`skills: [beadfinder]`), charts epics, runs session boot, coordinates subagents.
- `architect`: design worker (`phase:design` + `architect`), produces ADRs / architecture docs.
- `research`: research worker (`phase:requirements` + `research`, afk), investigates codebase and external docs.
- `implementer`: build worker (`phase:implement` + `implementation`), claims ticket, submits via `scripts/review-submit.sh`.
- `reviewer`: read-only reviewer (`phase:review` + `review`), re-runs verification, scores quality/correctness/pillars ≥ 8, passes or fails back.
- `product`: requirements worker (`product`, hitl), clarifies questions with user.

## Plugin Structure

Cline loads plugins from `.cline/plugins/` (or `~/.cline/plugins/` with `--global`).
The beadfinder plugin is installed to `.cline/plugins/beadfinder/`:
```
.cline/plugins/beadfinder/
  package.json     ← plugin manifest pointing to index.ts
  index.ts         ← plugin hook registration entry
  lib/
    policy.ts      ← core hook logic (createBeadfinder)
    tools.ts       ← Cline tool classification (read, write, bash, spawn, glob)
    paths.ts       ← protected paths, product paths, beads paths
    fsutil.ts      ← paths, JSON, debug checks
    state.ts       ← session state store (.cline/beadfinder/state.json)
    bd.ts          ← bd CLI wrapper & issue helpers
    log.ts         ← debug logging & status advisor
```
Test files (`*.test.ts`) are pruned upon install.

## Permissions & Policy Enforcement

The plugin enforces the same safety gates as Oh My Pi and OpenCode:
- **beforeTool**:
  - `env-protection`: blocks reading sensitive environment/credential files.
  - `beads-store`: blocks targeting bare `beads/` instead of `.beads/`.
  - `claim-gate`: blocks unassigned implementer writes; enforces single active non-research claim per session.
  - `persona-fs-guard`: blocks product file modifications by reviewer, wayfinder, research, or product. Blocks `gh issue` / tracker sidecars.
  - `hitl-affinity`: blocks spawning human-in-the-loop tickets into background agents.
  - `spawn-contract`: validates ticket id and claim-before-work tokens in spawn prompts.
  - `close-guard`: prevents closing destination epics; ensures implementers cannot close review beads; ensures reviewers only close with PASS and scores ≥ 8.
- **afterTool**:
  - Tracks tool executions against the mutating budget (`BEADFINDER_MUTATING_BUDGET`).
  - Records closed beads and refreshes live state after `bd close` or handoff scripts.
- **beforeRun / afterRun**:
  - Sets active persona and updates session tracking.
  - `yield-on-stop`: yields active claims on session completion if configured.

## Killswitch & Configuration

- Killswitch: Set `BEADFINDER_HOOKS=off` (or `0` / `false`) in the environment to disable all policy enforcement.
- Debug log: `<target-repo>/.cline/beadfinder-debug.log` (enabled when `beadfinder-debug` skill is installed or `BEADFINDER_DEBUG=1`).
- Verbose logging: `BEADFINDER_DEBUG=verbose`.
- State storage: `<target-repo>/.cline/beadfinder/state.json`.
- Mutating budget: `BEADFINDER_MUTATING_BUDGET=80` (default).
- Snapshot refresh interval: `BEADFINDER_REFRESH_MS=45000` (default 45s).
