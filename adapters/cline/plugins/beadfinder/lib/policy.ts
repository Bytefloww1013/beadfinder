/**
 * Cline shim: host events → PolicyEngine. Policy lives in engine.ts.
 */
import { PolicyEngine } from "./engine.ts";
import { hooksDisabled } from "./fsutil.ts";
import { isSystemAgent, toolName } from "./tools.ts";

export type ClineContext = {
  directory?: string;
  cwd?: string;
  client?: {
    session?: {
      prompt?: (args: Record<string, unknown>) => Promise<unknown>;
    };
    sendMessage?: (msg: unknown) => Promise<unknown> | void;
  };
  sendMessage?: (msg: unknown) => Promise<unknown> | void;
};

function getCwd(ctx?: ClineContext): string {
  return ctx?.directory || ctx?.cwd || process.cwd();
}

async function note(ctx: ClineContext | undefined, sessionID: string, text: string): Promise<void> {
  if (!text) return;
  try {
    if (ctx?.client?.session?.prompt) {
      await ctx.client.session.prompt({
        path: { id: sessionID },
        body: { noReply: true, parts: [{ type: "text", text, synthetic: true }] },
      });
      return;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof ctx?.client?.sendMessage === "function") {
      await ctx.client.sendMessage({ content: text, synthetic: true });
      return;
    }
    if (typeof ctx?.sendMessage === "function") {
      await ctx.sendMessage({ content: text, synthetic: true });
    }
  } catch {
    /* older runtimes - ignore */
  }
}

export function createBeadfinder(ctx?: ClineContext) {
  const engine = new PolicyEngine({
    directory: getCwd(ctx),
    notify: async (sessionId, message) => {
      await note(ctx, sessionId, message);
    },
    log: () => {},
  });

  return {
    beforeRun: async (input: { sessionID?: string; sessionId?: string; agent?: string; persona?: string }) => {
      if (hooksDisabled()) return;
      const sessionID = input.sessionID || input.sessionId || "default";
      const agent = input.agent || input.persona || "";
      if (isSystemAgent(agent)) return;
      await engine.onChatMessage(sessionID, agent, false);
    },

    afterRun: async (input: { sessionID?: string; sessionId?: string; reason?: string }) => {
      if (hooksDisabled()) return;
      await engine.onSessionEnd(input.sessionID || input.sessionId || "default", input.reason || "run.completed");
    },

    beforeTool: async (input: {
      tool?: string;
      toolName?: string;
      name?: string;
      sessionID?: string;
      sessionId?: string;
      callID?: string;
      callId?: string;
      args?: Record<string, unknown>;
      input?: Record<string, unknown>;
      parameters?: Record<string, unknown>;
    }) => {
      if (hooksDisabled()) return;
      const args = (input.args || input.input || input.parameters || {}) as Record<string, unknown>;
      await engine.beforeToolExecute(input.sessionID || input.sessionId || "default", toolName(input), args);
    },

    afterTool: async (input: {
      tool?: string;
      toolName?: string;
      name?: string;
      sessionID?: string;
      sessionId?: string;
      callID?: string;
      callId?: string;
      args?: Record<string, unknown>;
      input?: Record<string, unknown>;
      parameters?: Record<string, unknown>;
      output?: unknown;
      result?: unknown;
      error?: unknown;
      isError?: boolean;
    }) => {
      if (hooksDisabled()) return;
      const args = (input.args || input.input || input.parameters || {}) as Record<string, unknown>;
      const raw = input.output !== undefined ? input.output : input.result !== undefined ? input.result : input.error !== undefined ? input.error : "";
      const text = typeof raw === "string" ? raw : JSON.stringify(raw || "");
      const isErr =
        Boolean(input.isError) ||
        Boolean(input.error) ||
        (/\[beadfinder:/.test(text) ? false : /(?:^|\n)\s*(?:error|failed|permission denied)/i.test(text));
      await engine.afterToolExecute(input.sessionID || input.sessionId || "default", toolName(input), args, text, isErr);
    },
  };
}
