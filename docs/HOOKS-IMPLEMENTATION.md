# Beadfinder hooks — implementer plan

This is the working plan for agents changing the hook pack. Humans who only need behavior should read [HOOKS.md](HOOKS.md).

## Scope lock

- Policy for OMP lives in `adapters/ohmypi/extensions/beadfinder/`.
- Policy for OpenCode lives in `adapters/opencode/plugins/` (`beadfinder.ts` + `beadfinder/lib`).
- Debug logging is gated. Default install must not fill the debug log.
- Do not import claude-protocol’s “user closes after merge” / worktree rules.
- HITL stays label + ask in the parent. Hooks only stop it leaving the parent.
- Keep the two packs behavior-compatible. Do not add an OpenCode-only gate without an OMP twin, or vice versa.

## Layout

```
adapters/ohmypi/extensions/beadfinder/
  index.ts          thin default-export factory
  lib/
    policy.ts       hook body (createBeadfinder)
    debug.ts        registerDebug()
    fsutil.ts       paths, flags, json helpers
    state.ts        .omp/beadfinder/state.json
    tools.ts        tool/argv parsing
    paths.ts        protected / product / tracker
    bd.ts           bd exec + issue helpers
    log.ts          JSONL writer, debugEnabled()
adapters/opencode/plugins/
  beadfinder.ts     OpenCode plugin export (auto-loaded)
  beadfinder/lib/   same jobs as OMP lib; OpenCode events + apply_patch/task
adapters/opencode/commands/beadfinder.md
scripts/debug-log.py
companions/beadfinder-debug/
install.sh          --omp copies extension; --opencode copies plugin + commands; --debug copies debug skill
docs/HOOKS.md
docs/HOOKS-IMPLEMENTATION.md
```

OMP install target: `$ROOT/extensions/beadfinder/` where `$ROOT` is `.omp` or `~/.omp/agent`.

OpenCode install target: `$ROOT/plugins/beadfinder.ts` + `$ROOT/plugins/beadfinder/lib/` where `$ROOT` is `.opencode` or `~/.config/opencode`. OpenCode's glob is `{plugin,plugins}/*.{ts,js}` — do not flatten `lib/*.ts` next to the entry.

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

- `session_start`: `bd prime`, list **live** destinations and slices (`--status open,in_progress` as one query; slices are not filtered to `--type epic`), unlabeled `in_progress`, plus `bd ready --json`. Snapshot also says the store is `.beads/`.
- `before_agent_start` / throttled `turn_start`: reuse snapshot; `bd show` the claimed id; if closed, warn and `recordClosed`.
- After `bd close` in `tool_result`, force refresh.
- Do not use only `bd list --label beadfinder:slice --type epic --status open`. That reported “none” while `bd ready` still returned `in_progress` / non-epic slices.
- Do not print two JSON arrays from session-boot. Repeating `--status` overwrites; use the comma form. `asIssues` unwraps `{issues: [...]}` as well as a raw array.

### debug logging

- Write `error` / `warning` / `concern` when debug skill is installed or `BEADFINDER_DEBUG=1`.
- `info` only when `BEADFINDER_DEBUG=verbose`.
- `status-stale` looks at the **primary** `bd show` issue status, not the word “closed” anywhere in the JSON.
- Empty-frontier only from `claim-next.sh` / `frontier.sh` output (`[]` or `{"error":"empty frontier"}`).
- `registerDebug` is idempotent. `debugLog` drops identical lines within 80ms. Policy does not also log generic `tool_result` errors (that was a duplicate with debug).
- Glob/read of `beads/` is a `beads-store` block, not a raw glob error.

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
- HITL match: `\bhitl\b`, `beadfinder:grill`, `grill ticket`.
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

- `debugEnabled(cwd)` = `BEADFINDER_DEBUG` or `skills/beadfinder-debug/SKILL.md` present (project `.omp` / `.opencode`, or `~/.omp/agent` / `~/.config/opencode`).
- `lib/log.ts` is the only writer policy hooks should use.
- `scripts/debug-log.py` is the agent-facing writer. Keep flags stable: `--level --source --hook --message --details`.
- Do not log file contents or `.env` values.

## Order of work if something is broken

1. Confirm the pack loaded: dummy `.env` read should block. OMP: settings.json `extensions` if silent. OpenCode: file exists at `.opencode/plugins/beadfinder.ts` and OpenCode was restarted.
2. Confirm `bd` is on PATH inside the harness process, not only the user shell.
3. Confirm persona was recorded (`state.json`). OpenCode also infers it from the agent name.
4. Then touch the specific hook function. Do not rewrite the factory / plugin export.

## What not to add yet

- Claude-protocol worktree / PR-merged close rules
- Auto-picking which ready ticket to take
- Formulas or Beads gates for HITL
- Yielding on OpenCode `session.idle` (it is turn-end, not shutdown)

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

## OpenCode runtime facts

- Plugin signature: `export const BeadfinderPlugin = async (ctx) => hooks`. `ctx` is `{ client, directory, worktree, $ }`.
- Block a tool by **throwing** `new Error("[beadfinder:<hook>] …")` from `tool.execute.before`. There is no `{ block: true }` return.
- Inject advisor text with `client.session.prompt({ path: { id }, body: { noReply: true, parts: [{ type: "text", text, synthetic: true }] } })`. Skip `chat.message` handling when the parts are our snapshot (prefix `Live Beads snapshot`).
- `bd` is spawned with `child_process.spawn("bd", args, { cwd: directory })`. Always pass `--json` when parsing.
- Persona comes from the OpenCode agent name (`chat.message` / `input.agent`) plus `session-boot.sh --persona`. Hidden agents `title` / `summary` / `compaction` are ignored.
- State is `.opencode/beadfinder/state.json`, keyed by session id.
- `apply_patch` paths are parsed from `*** Add File:` / `*** Update File:` / `*** Delete File:` / `*** Move to:` lines in `args.patchText`.
- Spawn tool is `task` (`prompt`, `description`, `subagent_type`).
- Compact hook is `experimental.session.compacting` (`output.context.push(...)`). Do not use `session.compacted` — that is after the summary exists.
- Yield only on `session.deleted`. `session.idle` is every turn.
- Tests: `bun test adapters/opencode/plugins/beadfinder`.

## Verify before claiming “OpenCode hooks work”

From a throwaway project with `bd` installed:

```bash
bash /path/to/beadfinder/install.sh --opencode --debug
# restart opencode so plugins load
```

Smoke:
1. `read` on `.env` is blocked (`[beadfinder:env-protection]`).
2. Reviewer `write` to `src/foo.ts` is blocked (Tab to reviewer, or spawn it).
3. `bd close <destination>` is blocked.
4. Close a ticket, send a new message without mentioning it: injected snapshot must not list it as open.
5. With `--debug`, `.opencode/beadfinder-debug.log` gets a JSON line on that close mismatch.
