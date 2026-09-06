import { createBeadfinder, type ClineContext } from "./lib/policy.ts";

export interface AgentPlugin {
  name: string;
  manifest: {
    capabilities: string[];
  };
  setup?: (context: ClineContext) => Promise<void> | void;
  hooks: {
    beforeTool?: (input: {
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
    }) => Promise<void>;
    afterTool?: (input: {
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
    }) => Promise<void>;
    beforeRun?: (input: {
      sessionID?: string;
      sessionId?: string;
      agent?: string;
      persona?: string;
    }) => Promise<void>;
    afterRun?: (input: {
      sessionID?: string;
      sessionId?: string;
      reason?: string;
    }) => Promise<void>;
  };
}

let activePolicy: ReturnType<typeof createBeadfinder> | null = null;
let currentContext: ClineContext | undefined = undefined;

function getPolicy(): ReturnType<typeof createBeadfinder> {
  if (!activePolicy) {
    activePolicy = createBeadfinder(currentContext);
  }
  return activePolicy;
}

const plugin: AgentPlugin = {
  name: "beadfinder",
  manifest: {
    capabilities: ["hooks"],
  },
  setup: (context: ClineContext) => {
    currentContext = context;
    activePolicy = createBeadfinder(context);
  },
  hooks: {
    beforeTool: async (input) => {
      await getPolicy().beforeTool(input);
    },
    afterTool: async (input) => {
      await getPolicy().afterTool(input);
    },
    beforeRun: async (input) => {
      await getPolicy().beforeRun(input);
    },
    afterRun: async (input) => {
      await getPolicy().afterRun(input);
    },
  },
};

export default plugin;
