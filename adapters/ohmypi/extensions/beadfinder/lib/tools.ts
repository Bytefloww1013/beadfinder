// Harness-specific tool names/paths. Canonical definitions live in core/lib.
export * from "../../../../../core/lib/tools-core.ts";

export function toolName(event: { toolName?: string }): string {
  return String(event.toolName || "").toLowerCase();
}
