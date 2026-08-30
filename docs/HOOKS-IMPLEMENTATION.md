# Beadfinder hooks — implementer plan

This is the working plan for agents changing the hook pack. Humans who only need behavior should read [HOOKS.md](HOOKS.md).

## Scope lock

- OMP first. Do not add an OpenCode plugin in this pass.
- Policy lives in `adapters/ohmypi/extensions/beadfinder/`.
- Debug logging is gated. Default `--omp` install must not fill `.omp/beadfinder-debug.log`.
- Do not import claude-protocol’s “user closes after merge” / worktree rules.
- HITL stays label + ask in the parent. Hooks only stop it leaving the parent.

## Layout

```
adapters/ohmypi/extensions/beadfinder/
  index.ts          policy factory (default export)
  debug.ts          registerDebug()
  lib/
    fsutil.ts       paths, flags, json helpers
    state.ts        .omp/beadfinder/state.json
    tools.ts        tool/argv parsing
    paths.ts        protected / product / tracker
    bd.ts           bd exec + issue helpers
    log.ts          JSONL writer, debugEnabled()
scripts/debug-log.py
companions/beadfinder-debug/
install.sh          --omp copies extension; --debug copies debug skill
docs/HOOKS.md
docs/HOOKS-IMPLEMENTATION.md
```

Install target: `$ROOT/extensions/beadfinder/` where `$ROOT` is `.omp` or `~/.omp/agent`.

## Runtime facts (do not fight these)

- Factory signature: `export default function (pi: HookAPI): void`.
- Pre-tool event is `tool_call`. Return `{ block: true, reason }`.
- Post-tool event is `tool_result`.
- `pi.exec("bd", args)` for live Beads. Always pass `--json` when parsing.
- `pi.sendMessage({ customType, content, display, attribution })` to inject advisor text.
- `ctx.cwd` is the project, not the pack.
- OMP does not reliably give us the current agent name. Infer persona from `session-boot.sh --persona`, `claim-next.sh --persona`, and prior claims. Unknown persona still gets env-protection and destination-close.
- Some OMP builds discover `.omp/hooks/pre/*.ts` and never execute them. That is why we ship an **extension** directory. If a build still misses it, tell the user to put the path in `.omp/settings.json` `extensions`.

## State file

`.omp/beadfinder/state.json` (project local, not global):

```
persona, parent, claimedId, claimedAt, mode,
claimsThisSession, lastClaimedNonResearch, frontierEmpty,
mutatingTools, lastRefreshAt, lastSnapshot, seenClosed
```

Never store secrets. Safe to delete; hooks rebuild it.

## Hook implementation notes

### session-boot-inject + status-refresh

- `session_start`: `bd prime`, list open destinations and slices, inject snapshot.
- `before_agent_start` / throttled `turn_start`: reuse snapshot; `bd show` the claimed id; if closed, warn and `recordClosed`.
- After `bd close` in `tool_result`, force refresh.
- This is the fix for stale “still open” chat memory. Do not try to parse the whole transcript for assumed-open ids in v0.3.

### claim-gate

- Parse bash for `claim-next.sh` and `bd update --claim`.
- Product writes (`write`/`edit` or mutating bash into `src/` etc.) by `implementer` require `claimedId`.
- Wayfinder `bd create` during chart must keep working with no claim.

### persona-fs-guard

- Path checks in `lib/paths.ts`. Adjust prefixes if a target repo uses an unusual layout; keep the list boring.
- Reviewer: any product path is a block, including bash `sed -i`.

### hitl-affinity + spawn-contract

- Spawn tool names we match: `task`, `spawn`, `subagent`, `agent`, plus any name containing `task`.
- Flatten all string fields in the tool input and search that text.
- HITL match: `\\bhitl\\b`, `beadfinder:grill`, `grill ticket`.
- Spawn contract is strict on purpose. If false-positives show up on a real OMP task schema, loosen the id regex — do not drop the three required phrases.

### phase-gate

- Only when `bd create` labels include `phase:execute` or `beadfinder:build`.
- `--parent` or hook-state parent must be a wayfind slice with open children to block.

### bd-close-guard / map-append-only

- Destination close is always denied.
- Description updates on destination/slice must go through `append-decision.py`.
- Epic close with open children is denied.

### empty-frontier-stop / beads-only / env-protection / budget-cap / yield-on-stop / compact-preserve

- Behavior is in [HOOKS.md](HOOKS.md).
- Yield only when `BEADFINDER_YIELD_ON_STOP` is `1` or (`afk` and `state.mode === "afk"`). Default leaves HITL claims in place.

### debug

- `debugEnabled(cwd)` = `BEADFINDER_DEBUG` or `skills/beadfinder-debug/SKILL.md` present (project or `~/.omp/agent`).
- `lib/log.ts` is the only writer policy hooks should use.
- `scripts/debug-log.py` is the agent-facing writer. Keep flags stable: `--level --source --hook --message --details`.
- Do not log file contents or `.env` values.

## Order of work if something is broken

1. Confirm the extension loaded (block a dummy `.env` read). If it did not, settings.json `extensions`.
2. Confirm `bd` is on PATH inside `pi.exec`, not only the user shell.
3. Confirm persona was recorded (`state.json`).
4. Then touch the specific hook function. Do not rewrite the factory.

## What not to add yet

- OpenCode `tool.execute.before` ports
- Claude-protocol worktree / PR-merged close rules
- Auto-picking which ready ticket to take
- Formulas or Beads gates for HITL

## Verify before claiming “hooks work”

From a throwaway project with `bd` installed:

```bash
bash /path/to/beadfinder/install.sh --omp --debug
# restart omp so extensions load
```

Smoke:
1. `read` on `.env` is blocked.
2. Reviewer `write` to `src/foo.ts` is blocked (set persona via `session-boot.sh --persona reviewer` first).
3. `bd close <destination>` is blocked.
4. Close a ticket, start a new turn without mentioning it: injected snapshot must not list it as open.
5. With `--debug`, `.omp/beadfinder-debug.log` gets a JSON line on that close mismatch.

## Later (OpenCode)

Port only the hooks we still want after live OMP use. Map:

| Job | OMP | OpenCode |
|---|---|---|
| pre | `tool_call` | `tool.execute.before` |
| post | `tool_result` | `tool.execute.after` |
| boot | `session_start` | `session.created` |
| compact | `session.compacting` | `session.compacted` |
| stop | `agent_end` / `session_shutdown` | `session.idle` / `session.deleted` |
