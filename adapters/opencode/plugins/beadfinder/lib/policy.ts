/**
 * OpenCode shim: host events → PolicyEngine. Policy lives in engine.ts.
 */
import { PolicyEngine } from "./engine.ts";
import { hooksDisabled } from "./fsutil.ts";
import { isSystemAgent, SNAPSHOT_PREFIX, toolName } from "./tools.ts";

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

function looksLikeOurInject(text: string): boolean {
  return text.includes(SNAPSHOT_PREFIX) || text.startsWith("[beadfinder:");
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
  const engine = new PolicyEngine({
    directory: ctx.directory,
    notify: async (sessionId, message) => {
      if (!sessionId || !message) return;
      try {
        await ctx.client.session.prompt({
          path: { id: sessionId },
          body: { noReply: true, parts: [{ type: "text", text: message, synthetic: true }] },
        });
      } catch {
        /* older clients / missing session — never break the turn */
      }
    },
    log: () => {},
  });

  return {
    event: async ({ event }: { event: { type?: string; properties?: Record<string, unknown> } }) => {
      if (hooksDisabled()) return;
      const type = eventType(event);
      const sessionID = eventSessionID(event);
      if (type === "session.created" && sessionID) await engine.onSessionStart(sessionID);
      if (type === "session.deleted" && sessionID) await engine.onSessionEnd(sessionID, "session.deleted");
    },

    "chat.message": async (
      input: { sessionID?: string; agent?: string },
      output: { message?: { agent?: string }; parts?: Array<{ type?: string; text?: string; synthetic?: boolean }> },
    ) => {
      if (hooksDisabled()) return;
      const sessionID = input.sessionID || "";
      const agent = input.agent || output.message?.agent || "";
      if (isSystemAgent(agent)) return;
      const parts = output.parts || [];
      const texts = parts.filter((p) => p && p.type === "text" && typeof p.text === "string").map((p) => p.text || "");
      if (texts.some(looksLikeOurInject) || parts.every((p) => p.synthetic)) return;
      await engine.onChatMessage(sessionID, agent, false);
    },

    "tool.execute.before": async (
      input: { tool?: string; sessionID?: string; callID?: string },
      output: { args?: Record<string, unknown> },
    ) => {
      if (hooksDisabled()) return;
      await engine.beforeToolExecute(input.sessionID || "default", toolName(input), (output.args || {}) as Record<string, unknown>);
    },

    "tool.execute.after": async (
      input: { tool?: string; sessionID?: string; callID?: string; args?: Record<string, unknown> },
      output: { title?: string; output?: string; metadata?: unknown },
    ) => {
      if (hooksDisabled()) return;
      const text = String(output.output || "");
      const isError = /\[beadfinder:/.test(text) ? false : /(?:^|\n)\s*(?:error|failed|permission denied)/i.test(text);
      await engine.afterToolExecute(input.sessionID || "default", toolName(input), (input.args || {}) as Record<string, unknown>, text, isError);
    },

    "experimental.session.compacting": async (
      input: { sessionID?: string },
      output: { context: string[]; prompt?: string },
    ) => {
      if (hooksDisabled()) return;
      output.context.push(...engine.compactContext(input.sessionID || "default"));
    },
  };
}
