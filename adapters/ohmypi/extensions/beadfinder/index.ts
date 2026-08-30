/**
 * Beadfinder policy pack for Oh My Pi.
 * Default-export hook factory. Loaded from .omp/extensions/beadfinder/.
 */
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";
import { asIssues, formatSnapshot, isAppendDecision, isClaimNext, isClosedStatus, isSessionBoot, issueId, labelsOf, parseClaimNextArgs, rememberScriptContext, runBd } from "./lib/bd.ts";
import { hooksDisabled } from "./lib/fsutil.ts";
import { advisor, debugEnabled, debugLog } from "./lib/log.ts";
import { isLikelyAdrPath, isProductPath, isProtectedPath, isTrackerSidecar } from "./lib/paths.ts";
import { loadState, recordClosed, saveState, type Persona } from "./lib/state.ts";
import {
  bashCommand,
  firstBdInvocation,
  flagValue,
  hasFlag,
  inputPath,
  isBashTool,
  isReadTool,
  isSpawnTool,
  isWriteTool,
  labelBlob,
  looksLikeProductWriteBash,
  spawnText,
  toolName,
} from "./lib/tools.ts";
import { registerDebug } from "./debug.ts";

const BUDGET = Number(process.env.BEADFINDER_MUTATING_BUDGET || 80);
const REFRESH_MS = Number(process.env.BEADFINDER_REFRESH_MS || 45_000);
const YIELD_ON_STOP = (process.env.BEADFINDER_YIELD_ON_STOP || "afk").toLowerCase();

function note(pi: HookAPI, text: string, display = true): void {
  try {
    pi.sendMessage({
      customType: "beadfinder",
      content: text,
      display,
      attribution: "agent",
    });
  } catch {
    try {
      (pi.sendMessage as unknown as (s: string) => void)(text);
    } catch {
      /* ignore */
    }
  }
}

function block(cwd: string, hook: string, reason: string, details?: unknown) {
  advisor(cwd, hook, "error", reason, details);
  return { block: true, reason: `[beadfinder:${hook}] ${reason}` };
}

function warn(cwd: string, hook: string, reason: string, details?: unknown) {
  advisor(cwd, hook, "warning", reason, details);
}

async function liveSnapshot(pi: HookAPI): Promise<string> {
  const dest = await runBd(pi, ["list", "--label", "beadfinder:destination", "--type", "epic", "--status", "open", "--json"]);
  const slices = await runBd(pi, ["list", "--label", "beadfinder:slice", "--type", "epic", "--status", "open", "--json"]);
  const lines = [
    "Live Beads snapshot (do not trust earlier chat for ticket status):",
    formatSnapshot(asIssues(dest.json), "Open destinations"),
    formatSnapshot(asIssues(slices.json), "Open slices"),
  ];
  return lines.join("\n");
}

async function showIssue(pi: HookAPI, id: string) {
  const res = await runBd(pi, ["show", id, "--json"]);
  return asIssues(res.json)[0];
}

async function refreshAndInject(pi: HookAPI, cwd: string, force = false): Promise<void> {
  const state = loadState(cwd);
  const now = Date.now();
  if (!force && now - state.lastRefreshAt < REFRESH_MS) return;
  const snap = await liveSnapshot(pi);
  if (state.claimedId) {
    const issue = await showIssue(pi, state.claimedId);
    if (issue && isClosedStatus(issue.status)) {
      const msg = `Claimed ticket ${state.claimedId} is CLOSED in Beads (${issue.status}). Do not treat it as open. Yield and pick a live ticket.`;
      warn(cwd, "status-refresh", msg, issue);
      note(pi, msg);
      recordClosed(cwd, state.claimedId);
    }
  }
  const next = loadState(cwd);
  next.lastRefreshAt = now;
  next.lastSnapshot = snap;
  saveState(cwd, next);
  note(pi, snap, false);
}

function personaWall(cwd: string, persona: Persona, path: string): string | "" {
  if (isProtectedPath(cwd, path)) return `Protected path: ${path}`;
  if (isTrackerSidecar(cwd, path)) return `Do not invent a second tracker (${path}). File a bead.`;
  const product = isProductPath(cwd, path);
  const adr = isLikelyAdrPath(cwd, path);
  switch (persona) {
    case "wayfinder":
    case "product":
      if (product) return `${persona} may not edit product files (${path}).`;
      return "";
    case "architect":
      if (product && !adr) return `architect may not land production features (${path}).`;
      return "";
    case "reviewer":
      if (product) return `reviewer may not patch product files (${path}). File a blocker bead.`;
      return "";
    case "implementer":
      return "";
    default:
      return "";
  }
}

function hitlInText(text: string): boolean {
  return /\bhitl\b/i.test(text) || /beadfinder:grill/i.test(text) || /\bgrill ticket\b/i.test(text);
}

export default function beadfinder(pi: HookAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    if (hooksDisabled()) return;
    const cwd = ctx.cwd;
    debugLog(cwd, { level: "info", source: "hook", hook: "session-boot-inject", message: "session_start" });
    const primed = await runBd(pi, ["prime"]);
    if (!primed.ok && /not found|not on PATH|ENOENT/i.test(primed.raw)) {
      note(pi, "bd is not on PATH. Beadfinder cannot chart or claim until Beads is installed.");
      advisor(cwd, "session-boot-inject", "error", "bd missing", primed.raw);
      return;
    }
    await refreshAndInject(pi, cwd, true);
    const state = loadState(cwd);
    if (state.claimedId) {
      note(pi, `Session state still lists claimed ticket ${state.claimedId}. Re-query bd show ${state.claimedId} before acting.`);
    }
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    if (hooksDisabled()) return;
    await refreshAndInject(pi, ctx.cwd, false);
    const state = loadState(ctx.cwd);
    if (!state.lastSnapshot) return;
    return {
      message: {
        customType: "beadfinder-status",
        content: state.lastSnapshot,
        display: false,
        attribution: "agent",
      },
    };
  });

  pi.on("session.compacting", async (_event, ctx) => {
    if (hooksDisabled()) return;
    const state = loadState(ctx.cwd);
    const bits = [
      state.lastSnapshot || "No live snapshot. Run session-boot.sh and bd show on the claimed ticket.",
      state.claimedId ? `Claimed: ${state.claimedId}` : "No claimed ticket in hook state.",
      state.parent ? `Slice: ${state.parent}` : "",
      state.persona !== "unknown" ? `Persona: ${state.persona}` : "",
    ].filter(Boolean);
    return { context: bits };
  });

  pi.on("turn_start", async (_event, ctx) => {
    if (hooksDisabled()) return;
    await refreshAndInject(pi, ctx.cwd, false);
  });

  pi.on("tool_call", async (event, ctx) => {
    if (hooksDisabled()) return;
    const cwd = ctx.cwd;
    const name = toolName(event);
    const input = (event.input || {}) as Record<string, unknown>;
    const state = loadState(cwd);

    if (isReadTool(name) || isWriteTool(name)) {
      const p = inputPath(input);
      if (p && isProtectedPath(cwd, p)) {
        return block(cwd, "env-protection", `Blocked ${name} on protected path ${p}`, { path: p });
      }
    }

    if (isWriteTool(name)) {
      const p = inputPath(input);
      if (p && isTrackerSidecar(cwd, p)) {
        return block(cwd, "beads-only", `Do not track work in ${p}. Create a bead.`, { path: p });
      }
      if (p) {
        const wall = personaWall(cwd, state.persona, p);
        if (wall) return block(cwd, "persona-fs-guard", wall, { path: p, persona: state.persona });
      }
      if (state.frontierEmpty && p && isProductPath(cwd, p)) {
        return block(cwd, "empty-frontier-stop", "Frontier was empty. Do not invent product work. Stop and report.", { path: p });
      }
      if (state.persona === "implementer" && p && isProductPath(cwd, p) && !state.claimedId) {
        return block(cwd, "claim-gate", "Claim a build ticket before editing product files.", { path: p });
      }
      state.mutatingTools += 1;
      saveState(cwd, state);
      if (state.mutatingTools > BUDGET) {
        return block(cwd, "budget-cap", `Mutating-tool budget (${BUDGET}) exhausted for this session. Yield the claim and stop.`, {
          mutatingTools: state.mutatingTools,
        });
      }
    }

    if (isSpawnTool(name)) {
      const text = spawnText(input);
      if (hitlInText(text)) {
        return block(
          cwd,
          "hitl-affinity",
          "HITL / grill tickets stay in the wayfinder parent. Do not spawn a child for them.",
          { tool: name },
        );
      }
      const hasId = /\bbd-[a-z0-9._-]+|\b[a-z]+-\d+/i.test(text);
      const hasOne = /one ticket only/i.test(text);
      const hasClaim = /claim before work/i.test(text);
      if (text && !(hasId && hasOne && hasClaim)) {
        warn(cwd, "spawn-contract", "Child prompt is missing ticket id, one ticket only, or claim before work.", {
          hasId,
          hasOne,
          hasClaim,
        });
        return block(
          cwd,
          "spawn-contract",
          "Spawn prompt must include ticket title, id, parent slice id, ADR gists, one ticket only, and claim before work.",
        );
      }
    }

    if (!isBashTool(name)) return;
    const cmd = bashCommand(input);
    if (!cmd) return;

    rememberScriptContext(cwd, cmd);

    if (/\bgh\s+issue\s+create\b/.test(cmd)) {
      return block(cwd, "beads-only", "Do not open GitHub issues for this work. File a bead.");
    }

    if (looksLikeProductWriteBash(cmd)) {
      const wall = personaWall(cwd, loadState(cwd).persona, "src/");
      if (wall) return block(cwd, "persona-fs-guard", wall + " (via bash)", { cmd: cmd.slice(0, 240) });
      if (!loadState(cwd).claimedId && loadState(cwd).persona === "implementer") {
        return block(cwd, "claim-gate", "Claim a build ticket before rewriting product files with bash.");
      }
    }

    if (isClaimNext(cmd)) {
      const st = loadState(cwd);
      const parsed = parseClaimNextArgs(cmd);
      if (st.claimedId && st.lastClaimedNonResearch) {
        return block(
          cwd,
          "claim-gate",
          `This session already claimed ${st.claimedId}. One non-research ticket per session.`,
          { claimedId: st.claimedId },
        );
      }
      if (parsed.persona) {
        st.persona = parsed.persona;
        saveState(cwd, st);
      }
    }

    const bd = firstBdInvocation(cmd);
    if (!bd) return;

    const sub = bd[1] || "";

    if (sub === "ready" && hasFlag(bd, "--claim") === false && /bd\s+update\b/.test(cmd) && /--claim/.test(cmd)) {
      return block(cwd, "claim-gate", "Do not select then claim in two steps. Use claim-next.sh or bd ready --claim.");
    }

    if (sub === "update" && hasFlag(bd, "--claim")) {
      const st = loadState(cwd);
      const id = bd[2] && !bd[2].startsWith("-") ? bd[2] : "";
      if (st.claimedId && st.lastClaimedNonResearch && id && id !== st.claimedId) {
        return block(cwd, "claim-gate", `Already claimed ${st.claimedId} this session.`);
      }
    }

    if (sub === "create") {
      const labels = labelBlob(bd);
      if (/phase:execute|beadfinder:build/.test(labels)) {
        const parent = flagValue(bd, "--parent") || loadState(cwd).parent;
        if (parent) {
          const openKids = await runBd(pi, ["list", "--parent", parent, "--status", "open", "--json"]);
          const kids = asIssues(openKids.json).filter((i) => !isClosedStatus(i.status));
          const parentIssue = await showIssue(pi, parent);
          const parentLabels = parentIssue ? labelsOf(parentIssue).join(",") : "";
          if (/phase:wayfind/.test(parentLabels) && kids.length) {
            return block(
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
        return block(cwd, "bd-close-guard", "bd close requires --reason with a gist.");
      }
      if (id) {
        const issue = await showIssue(pi, id);
        const labels = issue ? labelsOf(issue).join(",") : "";
        if (/beadfinder:destination/.test(labels)) {
          return block(cwd, "bd-close-guard", `Refusing to close destination ${id}. Destination stays open.`);
        }
        const st = loadState(cwd);
        if (st.persona === "implementer" && /beadfinder:review/.test(labels)) {
          return block(cwd, "bd-close-guard", "Implementer may not close the review ticket.");
        }
        if (issue && (issue.type === "epic" || issue.issue_type === "epic" || /epic/i.test(String(issue.issue_type || issue.type || "")))) {
          const kids = asIssues((await runBd(pi, ["list", "--parent", id, "--status", "open", "--json"])).json);
          if (kids.length) {
            return block(cwd, "bd-close-guard", `Epic ${id} still has ${kids.length} open children.`, {
              open: kids.map(issueId),
            });
          }
        }
      }
    }

    if (sub === "update" && (hasFlag(bd, "--description") || hasFlag(bd, "-d")) && !isAppendDecision(cmd)) {
      const id = bd[2] && !bd[2].startsWith("-") ? bd[2] : "";
      if (id) {
        const issue = await showIssue(pi, id);
        const labels = issue ? labelsOf(issue).join(",") : "";
        if (/beadfinder:destination|beadfinder:slice/.test(labels)) {
          return block(
            cwd,
            "map-append-only",
            `Do not rewrite ${id}'s description by hand. Use append-decision.py for Decisions so far.`,
          );
        }
      }
    }

    return;
  });

  pi.on("tool_result", async (event, ctx) => {
    if (hooksDisabled()) return;
    const cwd = ctx.cwd;
    const name = toolName(event);
    const input = (event.input || {}) as Record<string, unknown>;
    const cmd = isBashTool(name) ? bashCommand(input) : "";
    const text = resultText(event);

    if (isClaimNext(cmd)) {
      const st = loadState(cwd);
      if (!text || text.trim() === "[]" || /empty frontier/.test(text) || (event as { isError?: boolean }).isError) {
        st.frontierEmpty = true;
        saveState(cwd, st);
        advisor(cwd, "empty-frontier-stop", "warning", "claim-next returned an empty frontier");
        note(pi, "Frontier empty (claim-next exit/empty). Stop. Do not invent tickets.");
      } else {
        st.frontierEmpty = false;
        const id = extractFirstId(text);
        if (id) {
          st.claimedId = id;
          st.claimedAt = new Date().toISOString();
          st.claimsThisSession += 1;
          st.lastClaimedNonResearch = st.persona !== "unknown";
        }
        const parsed = parseClaimNextArgs(cmd);
        if (parsed.persona) st.persona = parsed.persona;
        if (parsed.parent) st.parent = parsed.parent;
        saveState(cwd, st);
      }
    }

    if (isSessionBoot(cmd)) {
      const parsed = parseClaimNextArgs(cmd);
      const st = loadState(cwd);
      if (parsed.persona) st.persona = parsed.persona;
      if (parsed.parent) st.parent = parsed.parent;
      saveState(cwd, st);
      await refreshAndInject(pi, cwd, true);
    }

    const bd = firstBdInvocation(cmd);
    if (bd && bd[1] === "close") {
      const id = bd[2] && !bd[2].startsWith("-") ? bd[2] : "";
      if (id) {
        recordClosed(cwd, id);
        note(pi, `Beads close recorded for ${id}. Treat it as closed unless bd show says otherwise.`);
        await refreshAndInject(pi, cwd, true);
      }
    }

    if (bd && (bd[1] === "show" || bd[1] === "list")) {
      const closedHits = findClosedMentions(text);
      if (closedHits.length) {
        const st = loadState(cwd);
        for (const closedId of closedHits) st.seenClosed[closedId] = new Date().toISOString();
        saveState(cwd, st);
      }
    }

    if (debugEnabled(cwd) && (event as { isError?: boolean }).isError) {
      debugLog(cwd, {
        level: "error",
        source: "hook",
        hook: "tool_result",
        message: `${name} failed`,
        details: { cmd: cmd.slice(0, 400), text: text.slice(0, 800) },
      });
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (hooksDisabled()) return;
    await maybeYield(pi, ctx.cwd, "agent_end");
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (hooksDisabled()) return;
    await maybeYield(pi, ctx.cwd, "session_shutdown");
  });

  registerDebug(pi);
}

function resultText(event: { content?: unknown; details?: unknown }): string {
  const parts: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.text === "string") parts.push(o.text);
      if (typeof o.stdout === "string") parts.push(o.stdout);
      if (typeof o.stderr === "string") parts.push(o.stderr);
      Object.values(o).forEach((val) => {
        if (val && typeof val === "object") walk(val);
      });
    }
  };
  walk(event.content);
  walk(event.details);
  return parts.join("\n");
}

function extractFirstId(text: string): string {
  try {
    const json = JSON.parse(text);
    const issues = asIssues(json);
    if (issues[0]) return issueId(issues[0]);
  } catch {
    /* not json */
  }
  const m = text.match(/\b([a-z][a-z0-9]*-\d+(?:\.\d+)*)\b/i);
  return m ? m[1] : "";
}

function findClosedMentions(text: string): string[] {
  const ids: string[] = [];
  const re = /"id"\s*:\s*"([^"]+)".{0,120}"status"\s*:\s*"(closed|done|complete)"/gis;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) ids.push(m[1]);
  return ids;
}

async function maybeYield(pi: HookAPI, cwd: string, why: string): Promise<void> {
  const st = loadState(cwd);
  if (!st.claimedId) return;
  const mode = st.mode || "";
  const allow = YIELD_ON_STOP === "1" || YIELD_ON_STOP === "true" || (YIELD_ON_STOP === "afk" && mode === "afk");
  if (!allow) return;
  advisor(cwd, "yield-on-stop", "warning", `Yielding ${st.claimedId} on ${why}`, { mode });
  await runBd(pi, ["comment", st.claimedId, `session ended (${why}); yielding claim`]);
  await runBd(pi, ["assign", st.claimedId, ""]);
  const next = loadState(cwd);
  next.claimedId = "";
  saveState(cwd, next);
}
