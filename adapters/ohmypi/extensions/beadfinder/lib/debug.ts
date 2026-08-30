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
import { bashCommand, firstBdInvocation, isBashTool, toolName } from "./tools.ts";

function resultText(event: { content?: unknown; details?: unknown }): string {
  const parts: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.text === "string") parts.push(o.text);
      if (typeof o.stdout === "string") parts.push(o.stdout);
    }
  };
  walk(event.content);
  walk(event.details);
  return parts.join("\n");
}

function primaryIssueStatus(text: string): string {
  try {
    const json = JSON.parse(text);
    const issue = asIssues(json)[0];
    return issue ? String(issue.status || "") : "";
  } catch {
    return "";
  }
}

export function registerDebug(pi: HookAPI): void {
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
    const cmd = isBashTool(name) ? bashCommand((event.input || {}) as Record<string, unknown>) : "";

    if ((event as { isError?: boolean }).isError) {
      debugLog(ctx.cwd, {
        level: "error",
        source: "advisor",
        hook: "beadfinder-debug",
        message: `${name} returned an error`,
        details: { cmd: cmd.slice(0, 400), text: text.slice(0, 1200) },
      });
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
