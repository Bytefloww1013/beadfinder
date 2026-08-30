/**
 * Debug advisor. Only writes when beadfinder-debug is installed or
 * BEADFINDER_DEBUG=1. Policy hooks call lib/log.ts directly; this file
 * watches tools and agent turns for extra concerns.
 */
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";
import { debugEnabled, debugLog } from "./lib/log.ts";
import { bashCommand, firstBdInvocation, isBashTool, toolName } from "./lib/tools.ts";

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
    if (
      bd &&
      (bd[1] === "show" || bd[1] === "list" || bd[1] === "ready") &&
      /\bstatus["']?\s*[:=]\s*["']?(closed|done)\b/i.test(text)
    ) {
      debugLog(ctx.cwd, {
        level: "concern",
        source: "advisor",
        hook: "status-stale",
        message: "Beads output mentions a closed/done status. Chat history may still say this ticket is open.",
        details: { cmd: cmd.slice(0, 240), snippet: text.slice(0, 400) },
      });
    }

    if (/empty frontier|"error":"empty frontier"/.test(text)) {
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
