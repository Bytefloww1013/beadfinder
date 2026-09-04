/**
 * Beadfinder policy pack for OpenCode.
 * Maps OMP hooks onto plugin events. OpenCode only auto-loads
 * plugins/*.{ts,js}; this file is imported from plugins/beadfinder.ts.
 */
import {
  asIssues,
  extractFirstId,
  findClosedMentions,
  formatSnapshot,
  isAppendDecision,
  isClaimNext,
  isClosedStatus,
  isFrontier,
  isSessionBoot,
  issueId,
  labelsOf,
  listLive,
  modeFromLabels,
  parseClaimNextArgs,
  personaFromArg,
  rememberScriptContext,
  runBd,
} from "./bd.ts";
import { hooksDisabled } from "./fsutil.ts";
import { advisor, debugEnabled, debugLog } from "./log.ts";
import { isBareBeadsPath, isProductPath, isProtectedPath, isTrackerSidecar, personaWall } from "./paths.ts";
import { loadState, recordClosed, saveState, type SessionState } from "./state.ts";
import {
  bashCommand,
  firstBdInvocation,
  flagValue,
  hasFlag,
  hitlInText,
  isBashTool,
  isGlobTool,
  isReadTool,
  isSpawnTool,
  isSystemAgent,
  isWriteTool,
  labelBlob,
  looksLikeProductWriteBash,
  SNAPSHOT_PREFIX,
  spawnContract,
  spawnText,
  toolName,
  toolPaths,
} from "./tools.ts";

const BUDGET = Number(process.env.BEADFINDER_MUTATING_BUDGET || 80);
const REFRESH_MS = Number(process.env.BEADFINDER_REFRESH_MS || 45_000);
const YIELD_ON_STOP = (process.env.BEADFINDER_YIELD_ON_STOP || "afk").toLowerCase();

export type PluginCtx = {
  client: {
    session: {
      prompt: (args: Record<string, unknown>) => Promise<unknown>;
    };
    app?: {
      log?: (args: Record<string, unknown>) => Promise<unknown>;
    };
  };
  directory: string;
  worktree?: string;
};

function blockReason(hook: string, reason: string): string {
  return `[beadfinder:${hook}] ${reason}`;
}

function throwBlock(cwd: string, hook: string, reason: string, details?: unknown): never {
  advisor(cwd, hook, "error", reason, details);
  throw new Error(blockReason(hook, reason));
}

function warn(cwd: string, hook: string, reason: string, details?: unknown) {
  advisor(cwd, hook, "warning", reason, details);
}

function looksLikeOurInject(text: string): boolean {
  return text.includes(SNAPSHOT_PREFIX) || text.startsWith("[beadfinder:");
}

async function note(ctx: PluginCtx, sessionID: string, text: string): Promise<void> {
  if (!sessionID || !text) return;
  try {
    await ctx.client.session.prompt({
      path: { id: sessionID },
      body: {
        noReply: true,
        parts: [{ type: "text", text, synthetic: true }],
      },
    });
  } catch {
    /* older clients / missing session — never break the turn */
  }
}

async function liveSnapshot(cwd: string): Promise<string> {
  const dest = await listLive(cwd, ["list", "--label", "beadfinder:destination", "--type", "epic"]);
  const slices = await listLive(cwd, ["list", "--label", "beadfinder:slice"]);
  const inProg = asIssues((await runBd(cwd, ["list", "--status", "in_progress", "--json"])).json);
  const readyRes = await runBd(cwd, ["ready", "--limit", "20", "--json"]);
  const ready = asIssues(readyRes.json);
  const lines = [
    SNAPSHOT_PREFIX,
    "Beads store is `.beads/` (hidden). Do not glob `beads/`. Use bd show/list --json.",
    formatSnapshot(dest, "Live destinations (open + in_progress)"),
    formatSnapshot(slices, "Live slices (open + in_progress, any type)"),
    formatSnapshot(inProg, "In progress (any label)"),
    formatSnapshot(ready, "Ready work (bd ready)"),
  ];
  return lines.join("\n");
}

async function showIssue(cwd: string, id: string) {
  const res = await runBd(cwd, ["show", id, "--json"]);
  return asIssues(res.json)[0];
}

async function refreshAndInject(
  ctx: PluginCtx,
  sessionID: string,
  force = false,
): Promise<string> {
  const cwd = ctx.directory;
  const state = loadState(cwd, sessionID);
  const now = Date.now();
  if (!force && now - state.lastRefreshAt < REFRESH_MS) return state.lastSnapshot;
  const snap = await liveSnapshot(cwd);
  state.lastRefreshAt = now;
  state.lastSnapshot = snap;
  if (state.claimedId) {
    const issue = await showIssue(cwd, state.claimedId);
    if (issue && isClosedStatus(issue.status)) {
      const msg = `Claimed ticket ${state.claimedId} is CLOSED in Beads (${issue.status}). Do not treat it as open. Yield and pick a live ticket.`;
      warn(cwd, "status-refresh", msg, issue);
      await note(ctx, sessionID, msg);
      recordClosed(cwd, sessionID, state.claimedId);
    }
  }
  const next = loadState(cwd, sessionID);
  next.lastRefreshAt = now;
  next.lastSnapshot = snap;
  saveState(cwd, sessionID, next);
  await note(ctx, sessionID, snap);
  return snap;
}

async function bootSession(ctx: PluginCtx, sessionID: string): Promise<void> {
  const cwd = ctx.directory;
  debugLog(cwd, { level: "info", source: "hook", hook: "session-boot-inject", message: "session.created" });
  const primed = await runBd(cwd, ["prime"]);
  if (!primed.ok && /not found|not on PATH|ENOENT/i.test(primed.raw)) {
    await note(ctx, sessionID, "bd is not on PATH. Beadfinder cannot chart or claim until Beads is installed.");
    advisor(cwd, "session-boot-inject", "error", "bd missing", primed.raw);
    const missing = loadState(cwd, sessionID);
    missing.booted = true;
    saveState(cwd, sessionID, missing);
    return;
  }
  await refreshAndInject(ctx, sessionID, true);
  const state = loadState(cwd, sessionID);
  state.booted = true;
  saveState(cwd, sessionID, state);
  if (state.claimedId) {
    await note(
      ctx,
      sessionID,
      `Session state still lists claimed ticket ${state.claimedId}. Re-query bd show ${state.claimedId} before acting.`,
    );
  }
}

function maybeRecordPersona(cwd: string, sessionID: string, agent: string | undefined): SessionState {
  const state = loadState(cwd, sessionID);
  const persona = personaFromArg(agent || "");
  if (persona) {
    state.persona = persona;
    saveState(cwd, sessionID, state);
  }
  return loadState(cwd, sessionID);
}

async function handleToolBefore(
  ctx: PluginCtx,
  sessionID: string,
  name: string,
  input: Record<string, unknown>,
): Promise<void> {
  const cwd = ctx.directory;
  const state = loadState(cwd, sessionID);
  const paths = toolPaths(name, input);

  if (isGlobTool(name) || isReadTool(name)) {
    const bad = paths.find((p) => isBareBeadsPath(cwd, p));
    if (bad) {
      throwBlock(
        cwd,
        "beads-store",
        `Beads lives in .beads (hidden), not ${bad}. Use bd show/list --json or glob .beads.`,
        { path: bad },
      );
    }
  }

  if (isReadTool(name) || isWriteTool(name)) {
    const protectedPath = paths.find((p) => isProtectedPath(cwd, p));
    if (protectedPath) {
      throwBlock(cwd, "env-protection", `Blocked ${name} on protected path ${protectedPath}`, {
        path: protectedPath,
      });
    }
  }

  if (isWriteTool(name)) {
    const tracker = paths.find((p) => isTrackerSidecar(cwd, p));
    if (tracker) {
      throwBlock(cwd, "beads-only", `Do not track work in ${tracker}. Create a bead.`, { path: tracker });
    }
    for (const p of paths) {
      const wall = personaWall(cwd, state.persona, p);
      if (wall) throwBlock(cwd, "persona-fs-guard", wall, { path: p, persona: state.persona });
    }
    const product = paths.find((p) => isProductPath(cwd, p));
    if (state.frontierEmpty && product) {
      throwBlock(cwd, "empty-frontier-stop", "Frontier was empty. Do not invent product work. Stop and report.", {
        path: product,
      });
    }
    if (state.persona === "implementer" && product && !state.claimedId) {
      throwBlock(cwd, "claim-gate", "Claim a build ticket before editing product files.", { path: product });
    }
    state.mutatingTools += 1;
    saveState(cwd, sessionID, state);
    if (state.mutatingTools > BUDGET) {
      throwBlock(
        cwd,
        "budget-cap",
        `Mutating-tool budget (${BUDGET}) exhausted for this session. Yield the claim and stop.`,
        { mutatingTools: state.mutatingTools },
      );
    }
  }

  if (isSpawnTool(name)) {
    const text = spawnText(input);
    if (hitlInText(text)) {
      throwBlock(
        cwd,
        "hitl-affinity",
        "HITL / grill tickets stay in the wayfinder parent. Do not spawn a child for them.",
        { tool: name },
      );
    }
    const contract = spawnContract(text);
    if (text && !contract.ok) {
      warn(cwd, "spawn-contract", "Child prompt is missing ticket id, “one ticket only”, or “claim before work”.", contract);
      throwBlock(
        cwd,
        "spawn-contract",
        "Spawn prompt must include ticket title, id, parent slice id, decision gists, “one ticket only”, and “claim before work”.",
      );
    }
  }

  if (!isBashTool(name)) return;
  const cmd = bashCommand(input);
  if (!cmd) return;

  rememberScriptContext(cwd, sessionID, cmd);

  if (/\bgh\s+issue\s+create\b/.test(cmd)) {
    throwBlock(cwd, "beads-only", "Do not open GitHub issues for this work. File a bead.");
  }

  if (looksLikeProductWriteBash(cmd)) {
    const wall = personaWall(cwd, loadState(cwd, sessionID).persona, "src/");
    if (wall) throwBlock(cwd, "persona-fs-guard", wall + " (via bash)", { cmd: cmd.slice(0, 240) });
    const st = loadState(cwd, sessionID);
    if (!st.claimedId && st.persona === "implementer") {
      throwBlock(cwd, "claim-gate", "Claim a build ticket before rewriting product files with bash.");
    }
  }

  if (isClaimNext(cmd)) {
    const st = loadState(cwd, sessionID);
    const parsed = parseClaimNextArgs(cmd);
    if (st.claimedId && st.lastClaimedNonResearch) {
      throwBlock(
        cwd,
        "claim-gate",
        `This session already claimed ${st.claimedId}. One non-research ticket per session.`,
        { claimedId: st.claimedId },
      );
    }
    if (parsed.persona) {
      st.persona = parsed.persona;
      saveState(cwd, sessionID, st);
    }
  }

  const bd = firstBdInvocation(cmd);
  if (!bd) return;
  const sub = bd[1] || "";

  if (sub === "ready" && hasFlag(bd, "--claim") === false && /bd\s+update\b/.test(cmd) && /--claim/.test(cmd)) {
    throwBlock(cwd, "claim-gate", "Do not select then claim in two steps. Use claim-next.sh or bd ready --claim.");
  }

  if (sub === "update" && hasFlag(bd, "--claim")) {
    const st = loadState(cwd, sessionID);
    const id = bd[2] && !bd[2].startsWith("-") ? bd[2] : "";
    if (st.claimedId && st.lastClaimedNonResearch && id && id !== st.claimedId) {
      throwBlock(cwd, "claim-gate", `Already claimed ${st.claimedId} this session.`);
    }
  }

  if (sub === "create") {
    const labels = labelBlob(bd);
    if (/phase:(execute|implement)|beadfinder:build/.test(labels)) {
      const parent = flagValue(bd, "--parent") || loadState(cwd, sessionID).parent;
      if (parent) {
        const openKids = await runBd(cwd, ["list", "--parent", parent, "--status", "open", "--json"]);
        const kids = asIssues(openKids.json).filter((i) => !isClosedStatus(i.status));
        const parentIssue = await showIssue(cwd, parent);
        const parentLabels = parentIssue ? labelsOf(parentIssue).join(",") : "";
        if (/phase:(wayfind|plan)/.test(parentLabels) && kids.length) {
          throwBlock(
            cwd,
            "phase-gate",
            `Plan slice ${parent} still has ${kids.length} open child(ren). Do not cut an execute slice yet.`,
            { parent, open: kids.map(issueId) },
          );
        }
      }
    }
  }

  if (sub === "close") {
    const id = bd[2] && !bd[2].startsWith("-") ? bd[2] : "";
    if (!hasFlag(bd, "--reason") && !hasFlag(bd, "-r")) {
      throwBlock(cwd, "bd-close-guard", "bd close requires --reason with a gist.");
    }
    if (id) {
      const issue = await showIssue(cwd, id);
      const labels = issue ? labelsOf(issue).join(",") : "";
      if (/beadfinder:destination/.test(labels)) {
        throwBlock(cwd, "bd-close-guard", `Refusing to close destination ${id}. Destination stays open.`);
      }
      const st = loadState(cwd, sessionID);
      const inReview = /phase:review|(^|,)review(,|$)/.test(labels);
      if (st.persona === "implementer" && inReview) {
        throwBlock(cwd, "bd-close-guard", "Implementer may not close a bead under review. The reviewer closes on pass.");
      }
      if (st.persona === "reviewer" && inReview) {
        const reason = flagValue(bd, "--reason") || flagValue(bd, "-r");
        const scores = reason.match(/(\d+)\s*\/\s*10/g) || [];
        if (!/Review PASS/i.test(reason) || scores.length < 3) {
          throwBlock(
            cwd,
            "bd-close-guard",
            "Reviewer close reason must record all three scores: quality, correctness, pillars (e.g. Review PASS: quality 9/10, correctness 8/10, pillars 9/10.).",
          );
        }
      }
      if (
        issue &&
        (issue.type === "epic" ||
          issue.issue_type === "epic" ||
          /epic/i.test(String(issue.issue_type || issue.type || "")))
      ) {
        const kids = asIssues((await runBd(cwd, ["list", "--parent", id, "--status", "open", "--json"])).json);
        if (kids.length) {
          throwBlock(cwd, "bd-close-guard", `Epic ${id} still has ${kids.length} open children.`, {
            open: kids.map(issueId),
          });
        }
      }
    }
  }

  if (sub === "update" && (hasFlag(bd, "--description") || hasFlag(bd, "-d")) && !isAppendDecision(cmd)) {
    const id = bd[2] && !bd[2].startsWith("-") ? bd[2] : "";
    if (id) {
      const issue = await showIssue(cwd, id);
      const labels = issue ? labelsOf(issue).join(",") : "";
      if (/beadfinder:destination|beadfinder:slice/.test(labels)) {
        throwBlock(
          cwd,
          "map-append-only",
          `Do not rewrite ${id}'s description by hand. Use append-decision.py for Decisions so far.`,
        );
      }
    }
  }
}

async function handleToolAfter(
  ctx: PluginCtx,
  sessionID: string,
  name: string,
  args: Record<string, unknown>,
  outputText: string,
  isError: boolean,
): Promise<void> {
  const cwd = ctx.directory;
  const cmd = isBashTool(name) ? bashCommand(args) : "";
  const text = outputText || "";

  if (isClaimNext(cmd)) {
    const st = loadState(cwd, sessionID);
    if (!text || text.trim() === "[]" || /empty frontier/.test(text) || isError) {
      st.frontierEmpty = true;
      saveState(cwd, sessionID, st);
      advisor(cwd, "empty-frontier-stop", "warning", "claim-next returned an empty frontier");
      await note(ctx, sessionID, "Frontier empty (claim-next exit/empty). Stop. Do not invent tickets.");
    } else {
      st.frontierEmpty = false;
      const id = extractFirstId(text);
      if (id) {
        st.claimedId = id;
        st.claimedAt = new Date().toISOString();
        st.claimsThisSession += 1;
        st.lastClaimedNonResearch = st.persona !== "unknown";
        const issue = await showIssue(cwd, id);
        const mode = issue ? modeFromLabels(labelsOf(issue)) : "";
        if (mode) st.mode = mode;
      }
      const parsed = parseClaimNextArgs(cmd);
      if (parsed.persona) st.persona = parsed.persona;
      if (parsed.parent) st.parent = parsed.parent;
      saveState(cwd, sessionID, st);
    }
  }

  if (isSessionBoot(cmd)) {
    const parsed = parseClaimNextArgs(cmd);
    const st = loadState(cwd, sessionID);
    if (parsed.persona) st.persona = parsed.persona;
    if (parsed.parent) st.parent = parsed.parent;
    saveState(cwd, sessionID, st);
    await refreshAndInject(ctx, sessionID, true);
  }

  const bd = firstBdInvocation(cmd);
  if (bd && bd[1] === "close") {
    const id = bd[2] && !bd[2].startsWith("-") ? bd[2] : "";
    if (id) {
      recordClosed(cwd, sessionID, id);
      await note(ctx, sessionID, `Beads close recorded for ${id}. Treat it as closed unless bd show says otherwise.`);
      await refreshAndInject(ctx, sessionID, true);
    }
  }

  if (bd && (bd[1] === "show" || bd[1] === "list")) {
    const closedHits = findClosedMentions(text);
    if (closedHits.length) {
      const st = loadState(cwd, sessionID);
      for (const id of closedHits) st.seenClosed[id] = new Date().toISOString();
      saveState(cwd, sessionID, st);
    }
  }

  if (bd && bd[1] === "update" && hasFlag(bd, "--claim")) {
    const id = bd[2] && !bd[2].startsWith("-") ? bd[2] : "";
    if (id) {
      const issue = await showIssue(cwd, id);
      const st = loadState(cwd, sessionID);
      const mode = issue ? modeFromLabels(labelsOf(issue)) : "";
      if (mode) st.mode = mode;
      saveState(cwd, sessionID, st);
    }
  }

  if (!debugEnabled(cwd)) return;

  if (name === "bash" || name === "write" || name === "edit" || name === "apply_patch" || name === "task") {
    debugLog(cwd, {
      level: "info",
      source: "hook",
      hook: "beadfinder-debug",
      message: `tool_result ${name}`,
      details: { toolName: name },
    });
  }

  if (isError) {
    const paths = toolPaths(name, args);
    if (paths.some((p) => isBareBeadsPath(cwd, p)) || /path not found:\s*beads\b/i.test(text)) {
      debugLog(cwd, {
        level: "concern",
        source: "advisor",
        hook: "beads-store",
        message: "Glob/read missed the Beads store. Use .beads or bd show/list --json, not beads/.",
        details: { cmd: cmd.slice(0, 240), text: text.slice(0, 400) },
      });
    } else {
      debugLog(cwd, {
        level: "error",
        source: "advisor",
        hook: "beadfinder-debug",
        message: `${name} returned an error`,
        details: { cmd: cmd.slice(0, 400), text: text.slice(0, 1200) },
      });
    }
  }

  if (bd && bd[1] === "show") {
    let status = "";
    try {
      const json = JSON.parse(text.trim());
      const issue = asIssues(json)[0];
      status = issue ? String(issue.status || "") : "";
    } catch {
      status = "";
    }
    if (isClosedStatus(status)) {
      const shownId = bd[2] && !bd[2].startsWith("-") ? bd[2] : "";
      debugLog(cwd, {
        level: "concern",
        source: "advisor",
        hook: "status-stale",
        message: `${shownId || "shown ticket"} is ${status} on disk. Do not treat it as open from chat history.`,
        details: { cmd: cmd.slice(0, 240), status, shownId },
      });
    }
  }

  if (
    (isClaimNext(cmd) || isFrontier(cmd)) &&
    (/"error"\s*:\s*"empty frontier"/.test(text) || text.trim() === "[]" || text.trim() === "null")
  ) {
    debugLog(cwd, {
      level: "warning",
      source: "advisor",
      hook: "beadfinder-debug",
      message: "Empty frontier reported",
      details: { cmd: cmd.slice(0, 240) },
    });
  }
}

async function maybeYield(cwd: string, sessionID: string, why: string): Promise<void> {
  const st = loadState(cwd, sessionID);
  if (!st.claimedId) return;
  const mode = st.mode || "";
  const allow =
    YIELD_ON_STOP === "1" || YIELD_ON_STOP === "true" || (YIELD_ON_STOP === "afk" && mode === "afk");
  if (!allow) return;
  advisor(cwd, "yield-on-stop", "warning", `Yielding ${st.claimedId} on ${why}`, { mode });
  await runBd(cwd, ["comment", st.claimedId, `session ended (${why}); yielding claim`]);
  await runBd(cwd, ["assign", st.claimedId, ""]);
  const next = loadState(cwd, sessionID);
  next.claimedId = "";
  saveState(cwd, sessionID, next);
}

function compactContext(cwd: string, sessionID: string): string[] {
  const state = loadState(cwd, sessionID);
  return [
    state.lastSnapshot || "No live snapshot. Run session-boot.sh and bd show on the claimed ticket.",
    state.claimedId ? `Claimed: ${state.claimedId}` : "No claimed ticket in hook state.",
    state.parent ? `Slice: ${state.parent}` : "",
    state.persona !== "unknown" ? `Persona: ${state.persona}` : "",
  ].filter(Boolean);
}

function eventType(event: { type?: string }): string {
  return String(event.type || "");
}

function eventSessionID(event: { type?: string; properties?: Record<string, unknown> }): string {
  const props = event.properties || {};
  if (typeof props.sessionID === "string") return props.sessionID;
  const info = props.info;
  if (info && typeof info === "object" && typeof (info as { id?: string }).id === "string") {
    return (info as { id: string }).id;
  }
  return "";
}

export function createBeadfinder(ctx: PluginCtx) {
  const cwd = ctx.directory;

  return {
    event: async ({ event }: { event: { type?: string; properties?: Record<string, unknown> } }) => {
      if (hooksDisabled()) return;
      const type = eventType(event);
      const sessionID = eventSessionID(event);
      if (type === "session.created" && sessionID) {
        await bootSession(ctx, sessionID);
      }
      if (type === "session.deleted" && sessionID) {
        await maybeYield(cwd, sessionID, "session.deleted");
      }
    },

    "chat.message": async (
      input: { sessionID?: string; agent?: string },
      output: { message?: { agent?: string }; parts?: Array<{ type?: string; text?: string; synthetic?: boolean }> },
    ) => {
      if (hooksDisabled()) return;
      const sessionID = input.sessionID || "";
      const agent = input.agent || output.message?.agent || "";
      if (isSystemAgent(agent)) return;
      maybeRecordPersona(cwd, sessionID, agent);

      const texts = (output.parts || [])
        .filter((p) => p && p.type === "text" && typeof p.text === "string")
        .map((p) => p.text || "");
      if (texts.some(looksLikeOurInject) || (output.parts || []).every((p) => p.synthetic)) return;

      const state = loadState(cwd, sessionID);
      if (!state.booted) {
        await bootSession(ctx, sessionID);
      } else {
        await refreshAndInject(ctx, sessionID, false);
      }
    },

    "tool.execute.before": async (
      input: { tool?: string; sessionID?: string; callID?: string },
      output: { args?: Record<string, unknown> },
    ) => {
      if (hooksDisabled()) return;
      const name = toolName(input);
      const sessionID = input.sessionID || "default";
      const args = (output.args || {}) as Record<string, unknown>;
      if (debugEnabled(cwd) && (name === "bash" || name === "write" || name === "edit" || name === "apply_patch" || name === "task")) {
        debugLog(cwd, {
          level: "info",
          source: "hook",
          hook: "beadfinder-debug",
          message: `tool_call ${name}`,
          details: { toolName: name },
        });
      }
      await handleToolBefore(ctx, sessionID, name, args);
    },

    "tool.execute.after": async (
      input: { tool?: string; sessionID?: string; callID?: string; args?: Record<string, unknown> },
      output: { title?: string; output?: string; metadata?: unknown },
    ) => {
      if (hooksDisabled()) return;
      const name = toolName(input);
      const sessionID = input.sessionID || "default";
      const args = (input.args || {}) as Record<string, unknown>;
      const text = String(output.output || "");
      const isError = /\[beadfinder:/.test(text)
        ? false
        : /(?:^|\n)\s*(?:error|failed|permission denied)/i.test(text);
      await handleToolAfter(ctx, sessionID, name, args, text, isError);
    },

    "experimental.session.compacting": async (
      input: { sessionID?: string },
      output: { context: string[]; prompt?: string },
    ) => {
      if (hooksDisabled()) return;
      const sessionID = input.sessionID || "default";
      output.context.push(...compactContext(cwd, sessionID));
    },
  };
}
