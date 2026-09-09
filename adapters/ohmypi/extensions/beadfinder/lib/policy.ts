/**
 * Oh My Pi shim: host events → PolicyEngine.
 * Shared code is core/lib; install.sh copies it next to this file and rewrites
 * the core/lib imports to "./".
 *
 * SESSION IDENTITY SEAM: OMP hook payloads expose no session id, so we key off
 * BEADFINDER_SESSION_ID or the literal "default" bucket.
 */
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";
import { PolicyBlock, PolicyEngine } from "../../../../../core/lib/engine.ts";
import { hooksDisabled } from "../../../../../core/lib/fsutil.ts";
import { SNAPSHOT_PREFIX } from "../../../../../core/lib/tools-core.ts";
import { toolName } from "./tools.ts";
import { registerDebug } from "./debug.ts";

function sessionKey(): string {
  return process.env.BEADFINDER_SESSION_ID?.trim() || "default";
}

function engineFor(pi: HookAPI, cwd: string): PolicyEngine {
  return new PolicyEngine({
    directory: cwd,
    notify: async (_sessionId, message) => {
      if (!message) return;
      const display = !message.includes(SNAPSHOT_PREFIX);
      try {
        pi.sendMessage({ customType: "beadfinder", content: message, display, attribution: "agent" });
      } catch {
        try {
          (pi.sendMessage as unknown as (s: string) => void)(message);
        } catch {
          /* ignore */
        }
      }
    },
    log: () => {},
  });
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

export function createBeadfinder(pi: HookAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    if (hooksDisabled()) return;
    await engineFor(pi, ctx.cwd).onSessionStart(sessionKey());
  });

  pi.on("session.compacting", async (_event, ctx) => {
    if (hooksDisabled()) return;
    return { context: engineFor(pi, ctx.cwd).compactContext(sessionKey()) };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (hooksDisabled()) return;
    try {
      await engineFor(pi, ctx.cwd).beforeToolExecute(
        sessionKey(),
        toolName(event),
        (event.input || {}) as Record<string, unknown>,
      );
    } catch (err) {
      if (err instanceof PolicyBlock) return { block: true, reason: err.message };
      throw err;
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    if (hooksDisabled()) return;
    const input = (event.input || {}) as Record<string, unknown>;
    await engineFor(pi, ctx.cwd).afterToolExecute(
      sessionKey(),
      toolName(event),
      input,
      resultText(event),
      Boolean((event as { isError?: boolean }).isError),
    );
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (hooksDisabled()) return;
    await engineFor(pi, ctx.cwd).onSessionEnd(sessionKey(), "agent_end");
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (hooksDisabled()) return;
    await engineFor(pi, ctx.cwd).onSessionEnd(sessionKey(), "session_shutdown");
  });

  registerDebug(pi);
}
