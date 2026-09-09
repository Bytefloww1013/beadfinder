// Harness-specific tool names/paths. Canonical definitions live in core/lib.
export * from "../../../../../core/lib/tools-core.ts";

export function toolName(event: { tool?: string; toolName?: string }): string {
  return String(event.tool || event.toolName || "").toLowerCase();
}
