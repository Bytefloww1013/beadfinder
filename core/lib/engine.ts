/**
 * Harness-agnostic Beadfinder policy engine.
 *
 * Adapters translate host events onto these methods and map PolicyBlock
 * onto the host's block primitive. State lives in state.json (sessions map).
 */
import * as bd from "./bd.ts";
import { advisor, debugEnabled, debugLog } from "./log.ts";
import { isBareBeadsPath, isProductPath, isProtectedPath, isTrackerSidecar, personaWall } from "./paths.ts";
import { evaluateCloseGuard } from "./policy-core.ts";
import { loadState, recordClosed, saveState, type SessionState } from "./state.ts";
import {
  allBdInvocations,
  bashCommand,
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
  spawnContract,
  spawnText,
  toolPaths,
} from "./tools-core.ts";

const BUDGET = Number(process.env.BEADFINDER_MUTATING_BUDGET || 80);
const REFRESH_MS = Number(process.env.BEADFINDER_REFRESH_MS || 45_000);
const YIELD_ON_STOP = (process.env.BEADFINDER_YIELD_ON_STOP || "afk").toLowerCase();

const MUTATING_BD = new Set(["create", "update", "close", "ready", "comment", "assign"]);

export class PolicyBlock extends Error {
  readonly hook: string;
  constructor(hook: string, reason: string) {
    super(`[beadfinder:${hook}] ${reason}`);
    this.name = "PolicyBlock";
    this.hook = hook;
  }
}

export interface HarnessBridge {
  directory: string;
  notify(sessionId: string, message: string): Promise<void>;
  log(entry: { level: string; message: string; details?: unknown }): void;
}

export class PolicyEngine {
  constructor(private readonly bridge: HarnessBridge) {}

  async onSessionStart(sessionId: string): Promise<void> {
    const cwd = this.bridge.directory;
    debugLog(cwd, { level: "info", source: "hook", hook: "session-boot-inject", message: "session.created" });
    const primed = await bd.runBd(cwd, ["prime"]);
    if (!primed.ok && /not found|not on PATH|ENOENT/i.test(primed.raw)) {
      await this.bridge.notify(
        sessionId,
        "bd is not on PATH. Beadfinder cannot chart or claim until Beads is installed.",
      );
      advisor(cwd, "session-boot-inject", "error", "bd missing", primed.raw);
      const missing = loadState(cwd, sessionId);
      missing.booted = true;
      saveState(cwd, sessionId, missing);
      return;
    }
    await this.refreshAndInject(sessionId, true);
    const state = loadState(cwd, sessionId);
    state.booted = true;
    saveState(cwd, sessionId, state);
    if (state.claimedId) {
      await this.bridge.notify(
        sessionId,
        `Session state still lists claimed ticket ${state.claimedId}. Re-query bd show ${state.claimedId} before acting.`,
      );
    }
  }

  async onSessionEnd(sessionId: string, reason: string): Promise<void> {
    await this.maybeYield(sessionId, reason);
  }

  async onChatMessage(sessionId: string, agent: string, _isUser: boolean): Promise<void> {
    if (isSystemAgent(agent)) return;
    this.maybeRecordPersona(sessionId, agent);
    const state = loadState(this.bridge.directory, sessionId);
    if (!state.booted) await this.onSessionStart(sessionId);
  }

  async beforeToolExecute(sessionId: string, toolName: string, args: Record<string, unknown>): Promise<void> {
    const cwd = this.bridge.directory;
    const name = (toolName || "").toLowerCase();
    if (debugEnabled(cwd) && (isBashTool(name) || isWriteTool(name) || isSpawnTool(name))) {
      debugLog(cwd, {
        level: "info",
        source: "hook",
        hook: "beadfinder-debug",
        message: `tool_call ${name}`,
        details: { toolName: name },
      });
    }
    await this.handleToolBefore(sessionId, name, args);
  }

  async afterToolExecute(
    sessionId: string,
    toolName: string,
    args: Record<string, unknown>,
    output: string,
    isError: boolean,
  ): Promise<void> {
    await this.handleToolAfter(sessionId, (toolName || "").toLowerCase(), args, output, isError);
  }

  compactContext(sessionId: string): string[] {
    const state = loadState(this.bridge.directory, sessionId);
    const out = [
      `[beadfinder-active-state] Persona: ${state.persona || "wayfinder"} | Active Slice: ${state.parent || "none"} | Claimed Task: ${state.claimedId || "none"}`,
    ];
    if (state.claimedId) {
      out.push(
        `[active-rules] Implement only ticket ${state.claimedId}. Submit via scripts/review-submit.sh. Do not close directly.`,
      );
    }
    return out;
  }

  /** force skips the REFRESH_MS backoff; notify is still hash-gated. */
  async refreshAndInject(sessionId: string, force = false): Promise<string> {
    const cwd = this.bridge.directory;
    const state = loadState(cwd, sessionId);
    const now = Date.now();
    if (!force && now - state.lastRefreshAt < REFRESH_MS) return state.lastSnapshot;

    const snap = await bd.liveSnapshot(cwd);
    const hash = djb2(snap);

    if (state.claimedId) {
      const issue = await showIssue(cwd, state.claimedId);
      if (issue && bd.isClosedStatus(issue.status)) {
        const msg = `Claimed ticket ${state.claimedId} is CLOSED in Beads (${issue.status}). Do not treat it as open. Yield and pick a live ticket.`;
        this.warn("status-refresh", msg, issue);
        await this.bridge.notify(sessionId, msg);
        recordClosed(cwd, sessionId, state.claimedId);
      }
    }

    const next = loadState(cwd, sessionId);
    next.lastRefreshAt = now;
    next.lastSnapshot = snap;
    const changed = hash !== next.lastSnapshotHash;
    if (changed) next.lastSnapshotHash = hash;
    saveState(cwd, sessionId, next);

    if (changed && snap) await this.bridge.notify(sessionId, snap);
    return snap;
  }

  private maybeRecordPersona(sessionId: string, agent: string | undefined): SessionState {
    const cwd = this.bridge.directory;
    const state = loadState(cwd, sessionId);
    const persona = bd.personaFromArg(agent || "");
    if (persona) {
      state.persona = persona;
      saveState(cwd, sessionId, state);
    }
    return loadState(cwd, sessionId);
  }

  private async handleToolBefore(sessionId: string, name: string, input: Record<string, unknown>): Promise<void> {
    const cwd = this.bridge.directory;
    const state = loadState(cwd, sessionId);
    const paths = toolPaths(name, input);

    if (isGlobTool(name) || isReadTool(name)) {
      const bad = paths.find((p) => isBareBeadsPath(cwd, p));
      if (bad) {
        this.block(
          "beads-store",
          `Beads lives in .beads (hidden), not ${bad}. Use bd show/list --json or glob .beads.`,
          { path: bad },
        );
      }
    }

    if (isReadTool(name) || isWriteTool(name)) {
      const protectedPath = paths.find((p) => isProtectedPath(cwd, p));
      if (protectedPath) {
        this.block("env-protection", `Blocked ${name} on protected path ${protectedPath}`, { path: protectedPath });
      }
    }

    if (isWriteTool(name)) {
      const tracker = paths.find((p) => isTrackerSidecar(cwd, p));
      if (tracker) {
        this.block("beads-only", `Do not track work in ${tracker}. Create a bead.`, { path: tracker });
      }
      for (const p of paths) {
        const wall = personaWall(cwd, state.persona, p);
        if (wall) this.block("persona-fs-guard", wall, { path: p, persona: state.persona });
      }
      const product = paths.find((p) => isProductPath(cwd, p));
      if (state.frontierEmpty && product) {
        this.block("empty-frontier-stop", "Frontier was empty. Do not invent product work. Stop and report.", {
          path: product,
        });
      }
      if (state.persona === "implementer" && product && !state.claimedId) {
        this.block("claim-gate", "Claim a build ticket before editing product files.", { path: product });
      }
      state.mutatingTools += 1;
      saveState(cwd, sessionId, state);
      if (state.mutatingTools > BUDGET) {
        this.block(
          "budget-cap",
          `Mutating-tool budget (${BUDGET}) exhausted for this session. Yield the claim and stop.`,
          { mutatingTools: state.mutatingTools },
        );
      }
    }

    if (isSpawnTool(name)) {
      const text = spawnText(input);
      if (hitlInText(text)) {
        this.block("hitl-affinity", "HITL / grill tickets stay in the wayfinder parent. Do not spawn a child for them.", {
          tool: name,
        });
      }
      const contract = spawnContract(text);
      if (text && !contract.ok) {
        this.warn("spawn-contract", "Child prompt is missing ticket id, “one ticket only”, or “claim before work”.", contract);
        this.block(
          "spawn-contract",
          "Spawn prompt must include ticket title, id, parent slice id, decision gists, “one ticket only”, and “claim before work”.",
        );
      }
    }

    if (!isBashTool(name)) return;
    const cmd = bashCommand(input);
    if (!cmd) return;

    bd.rememberScriptContext(cwd, sessionId, cmd);

    if (/\bgh\s+issue\s+create\b/.test(cmd)) {
      this.block("beads-only", "Do not open GitHub issues for this work. File a bead.");
    }

    if (looksLikeProductWriteBash(cmd)) {
      const wall = personaWall(cwd, loadState(cwd, sessionId).persona, "src/");
      if (wall) this.block("persona-fs-guard", wall + " (via bash)", { cmd: cmd.slice(0, 240) });
      const st = loadState(cwd, sessionId);
      if (!st.claimedId && st.persona === "implementer") {
        this.block("claim-gate", "Claim a build ticket before rewriting product files with bash.");
      }
    }

    if (bd.isClaimNext(cmd)) {
      const st = loadState(cwd, sessionId);
      const parsed = bd.parseClaimNextArgs(cmd);
      if (st.claimedId && st.lastClaimedNonResearch) {
        this.block(
          "claim-gate",
          `This session already claimed ${st.claimedId}. One non-research ticket per session.`,
          { claimedId: st.claimedId },
        );
      }
      if (parsed.persona) {
        st.persona = parsed.persona;
        saveState(cwd, sessionId, st);
      }
    }

    const invocations = allBdInvocations(cmd);
    if (
      invocations.some((argv) => (argv[1] || "") === "ready" && hasFlag(argv, "--claim") === false) &&
      /bd\s+update\b/.test(cmd) &&
      /--claim/.test(cmd)
    ) {
      this.block("claim-gate", "Do not select then claim in two steps. Use claim-next.sh or bd ready --claim.");
    }

    const appendOk = bd.isAppendDecision(cmd);
    for (const argv of invocations) {
      await this.inspectBdInvocation(sessionId, argv, appendOk);
    }
  }

  private async inspectBdInvocation(sessionId: string, argv: string[], appendOk: boolean): Promise<void> {
    const cwd = this.bridge.directory;
    const sub = argv[1] || "";
    const id = argv[2] && !argv[2].startsWith("-") ? argv[2] : "";

    if (sub === "update" && hasFlag(argv, "--claim")) {
      const st = loadState(cwd, sessionId);
      if (st.claimedId && st.lastClaimedNonResearch && id && id !== st.claimedId) {
        this.block("claim-gate", `Already claimed ${st.claimedId} this session.`);
      }
    }

    if (sub === "create") {
      const labels = labelBlob(argv);
      if (/phase:(execute|implement)|beadfinder:build/.test(labels)) {
        const parent = flagValue(argv, "--parent") || loadState(cwd, sessionId).parent;
        if (parent) {
          const openKids = await bd.runBd(cwd, ["list", "--parent", parent, "--status", "open", "--json"]);
          const kids = bd.asIssues(openKids.json).filter((i) => !bd.isClosedStatus(i.status));
          const parentIssue = await showIssue(cwd, parent);
          const parentLabels = parentIssue ? bd.labelsOf(parentIssue).join(",") : "";
          if (/phase:(wayfind|plan)/.test(parentLabels) && kids.length) {
            this.block(
              "phase-gate",
              `Plan slice ${parent} still has ${kids.length} open child(ren). Do not cut an execute slice yet.`,
              { parent, open: kids.map(bd.issueId) },
            );
          }
        }
      }
    }

    if (sub === "close") {
      if (!hasFlag(argv, "--reason") && !hasFlag(argv, "-r")) {
        this.block("bd-close-guard", "bd close requires --reason with a gist.");
      }
      if (id) {
        const issue = await showIssue(cwd, id);
        const labels = issue ? bd.labelsOf(issue).join(",") : "";
        if (/beadfinder:destination/.test(labels)) {
          this.block("bd-close-guard", `Refusing to close destination ${id}. Destination stays open.`);
        }
        const st = loadState(cwd, sessionId);
        const inReview = /phase:review|(^|,)review(,|$)/.test(labels);
        if (st.persona === "implementer" && inReview) {
          this.block("bd-close-guard", "Implementer may not close a bead under review. The reviewer closes on pass.");
        }
        if (st.persona === "reviewer" && inReview) {
          const reason = flagValue(argv, "--reason") || flagValue(argv, "-r");
          const r = evaluateCloseGuard(reason);
          if (!r.ok) this.block(r.hook, r.message);
        }
        if (
          issue &&
          (issue.type === "epic" ||
            issue.issue_type === "epic" ||
            /epic/i.test(String(issue.issue_type || issue.type || "")))
        ) {
          const kids = bd.asIssues((await bd.runBd(cwd, ["list", "--parent", id, "--status", "open", "--json"])).json);
          if (kids.length) {
            this.block("bd-close-guard", `Epic ${id} still has ${kids.length} open children.`, {
              open: kids.map(bd.issueId),
            });
          }
        }
      }
    }

    if (sub === "update" && (hasFlag(argv, "--description") || hasFlag(argv, "-d")) && !appendOk) {
      if (id) {
        const issue = await showIssue(cwd, id);
        const labels = issue ? bd.labelsOf(issue).join(",") : "";
        if (/beadfinder:destination|beadfinder:slice/.test(labels)) {
          this.block(
            "map-append-only",
            `Do not rewrite ${id}'s description by hand. Use append-decision.py for Decisions so far.`,
          );
        }
      }
    }
  }

  private async handleToolAfter(
    sessionId: string,
    name: string,
    args: Record<string, unknown>,
    outputText: string,
    isError: boolean,
  ): Promise<void> {
    const cwd = this.bridge.directory;
    const cmd = isBashTool(name) ? bashCommand(args) : "";
    const text = outputText || "";

    if (bd.isClaimNext(cmd)) {
      const st = loadState(cwd, sessionId);
      if (!text || text.trim() === "[]" || /empty frontier/.test(text) || isError) {
        st.frontierEmpty = true;
        saveState(cwd, sessionId, st);
        advisor(cwd, "empty-frontier-stop", "warning", "claim-next returned an empty frontier");
        await this.bridge.notify(sessionId, "Frontier empty (claim-next exit/empty). Stop. Do not invent tickets.");
      } else {
        st.frontierEmpty = false;
        const id = bd.extractFirstId(text);
        if (id) {
          st.claimedId = id;
          st.claimedAt = new Date().toISOString();
          st.claimsThisSession += 1;
          st.lastClaimedNonResearch = st.persona !== "unknown";
          const issue = await showIssue(cwd, id);
          const mode = issue ? bd.modeFromLabels(bd.labelsOf(issue)) : "";
          if (mode) st.mode = mode;
        }
        const parsed = bd.parseClaimNextArgs(cmd);
        if (parsed.persona) st.persona = parsed.persona;
        if (parsed.parent) st.parent = parsed.parent;
        saveState(cwd, sessionId, st);
      }
    }

    if (bd.isSessionBoot(cmd)) {
      const parsed = bd.parseClaimNextArgs(cmd);
      const st = loadState(cwd, sessionId);
      if (parsed.persona) st.persona = parsed.persona;
      if (parsed.parent) st.parent = parsed.parent;
      const snap = await bd.liveSnapshot(cwd);
      st.lastSnapshot = snap;
      st.lastSnapshotHash = djb2(snap);
      st.lastRefreshAt = Date.now();
      saveState(cwd, sessionId, st);
    }

    const invocations = cmd ? allBdInvocations(cmd) : [];
    for (const argv of invocations) {
      const sub = argv[1] || "";
      const id = argv[2] && !argv[2].startsWith("-") ? argv[2] : "";
      if (sub === "close" && id) {
        recordClosed(cwd, sessionId, id);
        await this.bridge.notify(
          sessionId,
          `Beads close recorded for ${id}. Treat it as closed unless bd show says otherwise.`,
        );
      }
      if (sub === "show" || sub === "list") {
        const closedHits = bd.findClosedMentions(text);
        if (closedHits.length) {
          const st = loadState(cwd, sessionId);
          for (const closedId of closedHits) st.seenClosed[closedId] = new Date().toISOString();
          saveState(cwd, sessionId, st);
        }
      }
      if (sub === "update" && hasFlag(argv, "--claim") && id) {
        const issue = await showIssue(cwd, id);
        const st = loadState(cwd, sessionId);
        const mode = issue ? bd.modeFromLabels(bd.labelsOf(issue)) : "";
        if (mode) st.mode = mode;
        saveState(cwd, sessionId, st);
      }
    }

    if (
      bd.isClaimNext(cmd) ||
      /review-submit\.sh\b/.test(cmd) ||
      /review-verdict\.sh\b/.test(cmd) ||
      invocations.some((argv) => MUTATING_BD.has(argv[1] || ""))
    ) {
      await this.refreshAndInject(sessionId, true);
    }

    if (!debugEnabled(cwd)) return;

    if (isBashTool(name) || isWriteTool(name) || isSpawnTool(name)) {
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

    for (const argv of invocations) {
      if ((argv[1] || "") !== "show") continue;
      let status = "";
      try {
        const json = JSON.parse(text.trim());
        const issue = bd.asIssues(json)[0];
        status = issue ? String(issue.status || "") : "";
      } catch {
        status = "";
      }
      if (bd.isClosedStatus(status)) {
        const shownId = argv[2] && !argv[2].startsWith("-") ? argv[2] : "";
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
      (bd.isClaimNext(cmd) || bd.isFrontier(cmd)) &&
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

  private async maybeYield(sessionId: string, why: string): Promise<void> {
    const cwd = this.bridge.directory;
    const st = loadState(cwd, sessionId);
    if (!st.claimedId) return;
    const mode = st.mode || "";
    const allow =
      YIELD_ON_STOP === "1" || YIELD_ON_STOP === "true" || (YIELD_ON_STOP === "afk" && mode === "afk");
    if (!allow) return;
    advisor(cwd, "yield-on-stop", "warning", `Yielding ${st.claimedId} on ${why}`, { mode });
    await bd.runBd(cwd, ["comment", st.claimedId, `session ended (${why}); yielding claim`]);
    await bd.runBd(cwd, ["assign", st.claimedId, ""]);
    const next = loadState(cwd, sessionId);
    next.claimedId = "";
    saveState(cwd, sessionId, next);
  }

  private warn(hook: string, reason: string, details?: unknown): void {
    advisor(this.bridge.directory, hook, "warning", reason, details);
    this.bridge.log({ level: "warning", message: reason, details });
  }

  private block(hook: string, reason: string, details?: unknown): never {
    advisor(this.bridge.directory, hook, "error", reason, details);
    this.bridge.log({ level: "error", message: reason, details });
    throw new PolicyBlock(hook, reason);
  }
}

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

async function showIssue(cwd: string, id: string) {
  const res = await bd.runBd(cwd, ["show", id, "--json"]);
  return bd.asIssues(res.json)[0];
}
