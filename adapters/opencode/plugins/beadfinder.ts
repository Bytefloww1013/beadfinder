/**
 * Beadfinder policy plugin for OpenCode.
 * Auto-loaded from .opencode/plugins/beadfinder.ts (or ~/.config/opencode/plugins).
 * Helpers live in ./beadfinder/lib so OpenCode's `{plugin,plugins}/*.{ts,js}` glob
 * does not treat them as extra plugin entries.
 */
import { createBeadfinder } from "./beadfinder/lib/policy.ts";

export const BeadfinderPlugin = async (ctx: {
  client: {
    session: { prompt: (args: Record<string, unknown>) => Promise<unknown> };
  };
  directory: string;
  worktree?: string;
}) => {
  return createBeadfinder(ctx);
};
