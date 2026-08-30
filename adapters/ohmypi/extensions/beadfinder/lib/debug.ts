/**
 * Debug advisor. Only writes when beadfinder-debug is installed or
 * BEADFINDER_DEBUG=1/verbose. Policy hooks call lib/log.ts directly; this
 * file watches tools and agent turns for extra concerns.
 *
 * Default log levels: error, warning, concern.
 * Info (tool_call / turn_end / agent_end) needs BEADFINDER_DEBUG=verbose.
 */
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";
import { asIssues, isClaimNext, isClosedStatus, isFrontier } from "./bd.ts";
import { debugEnabled, debugLog } from "./log.ts";
import { isBareBeadsPath } from "./paths.ts";
import { bashCommand, firstBdInvocation, globSearchPaths, isBashTool, isGlobTool, toolName } from "./tools.ts";

let registered = false;

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
    }
  };
  walk(event.content);
  walk(event.details);
  return parts.join("\n");
}

function primaryIssueStatus(text: string): string {
  try {
    const json = JSON.parse(text.trim());
    const issue = asIssues(json)[0];
    return issue ? String(issue.status || "") : "";
  } catch {
    return "";
  }
}

function isBareBeadsMiss(cwd: string, name: string, input: Record<string, unknown>, text: string): boolean {
  if (isGlobTool(name) || name === "read") {
    if (globSearchPaths(input).some((p) => isBareBeadsPath(cwd, p))) return true;
  }
  return /path not found:\s*beads\b/i.test(text);
}

export function registerDebug(pi: HookAPI): void {
  if (registered) return;
  registered = true;

  pi.on("tool_call", async (event, ctx) => {
    if (!debugEnabled(ctx.cwd)) return;
    const name = toolName(event);
    if (name === "bash" || name === "write" || name === "edit" || name === "task") {
      debugLog(ctx.cwd, {
        level: "info",
        source: "hook",
        hook: "beadfinder-debug",
        message: `tool_call ${name}`,
        details: { toolName: name },
      });
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    if (!debugEnabled(ctx.cwd)) return;
    const name = toolName(event);
    const text = resultText(event);
    const input = (event.input || {}) as Record<string, unknown>;
    const cmd = isBashTool(name) ? bashCommand(input) : "";

    if ((event as { isError?: boolean }).isError) {
      if (isBareBeadsMiss(ctx.cwd, name, input, text)) {
        debugLog(ctx.cwd, {
          level: "concern",
          source: "advisor",
          hook: "beads-store",
          message: "Glob/read missed the Beads store. Use .beads or bd show/list --json, not beads/.",
          details: { cmd: cmd.slice(0, 240), text: text.slice(0, 400) },
        });
      } else {
        debugLog(ctx.cwd, {
          level: "error",
          source: "advisor",
          hook: "beadfinder-debug",
          message: `${name} returned an error`,
          details: { cmd: cmd.slice(0, 400), text: text.slice(0, 1200) },
        });
      }
    }

    const bd = firstBdInvocation(cmd);
    if (bd && bd[1] === "show") {
      const status = primaryIssueStatus(text);
      if (isClosedStatus(status)) {
        const shownId = bd[2] && !bd[2].startsWith("-") ? bd[2] : "";
        debugLog(ctx.cwd, {
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
      debugLog(ctx.cwd, {
        level: "warning",
        source: "advisor",
        hook: "beadfinder-debug",
        message: "Empty frontier reported",
        details: { cmd: cmd.slice(0, 240) },
      });
    }
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (!debugEnabled(ctx.cwd)) return;
    debugLog(ctx.cwd, {
      level: "info",
      source: "hook",
      hook: "beadfinder-debug",
      message: "turn_end",
    });
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!debugEnabled(ctx.cwd)) return;
    debugLog(ctx.cwd, {
      level: "info",
      source: "hook",
      hook: "beadfinder-debug",
      message: "agent_end",
    });
  });
}
