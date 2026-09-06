// Pure tokenizer/argv helpers live in core/lib/tools-core.ts (vendored by
// scripts/sync-adapters.ts — ohmypi's manifest slice includes it). Only the
// helpers whose behavior is identical across harnesses are re-exported here;
// classification sets and input-shape helpers stay local on purpose (OMP's
// apply_patch is NOT a write tool; spawn/glob classifiers are narrower; and
// inputPath deliberately ignores a bare "file" key).
export {
  applyPatchPaths,
  bashCommand,
  firstBdInvocation,
  flagValue,
  hasFlag,
  labelBlob,
  looksLikeMutatingBash,
  looksLikeProductWriteBash,
  spawnText,
  tokenize,
} from "./tools-core.ts";

const WRITE_TOOLS = new Set(["write", "edit", "multiedit"]);
const READ_TOOLS = new Set(["read"]);
const BASH_TOOLS = new Set(["bash", "shell"]);
const SPAWN_TOOLS = new Set(["task", "spawn", "subagent", "agent"]);
const GLOB_TOOLS = new Set(["glob", "grep", "search", "list_dir", "ls"]);
const PATH_KEYS = ["path", "filePath", "file_path", "filename", "target_directory", "targetDirectory"];

export function toolName(event: { toolName?: string }): string {
  return String(event.toolName || "").toLowerCase();
}

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

export function isReadTool(name: string): boolean {
  return READ_TOOLS.has(name);
}

export function isBashTool(name: string): boolean {
  return BASH_TOOLS.has(name);
}

export function isSpawnTool(name: string): boolean {
  return SPAWN_TOOLS.has(name) || name.includes("task");
}

export function isGlobTool(name: string): boolean {
  return GLOB_TOOLS.has(name) || name.includes("glob");
}

export function inputPath(input: Record<string, unknown>): string {
  for (const key of PATH_KEYS) {
    const v = input[key];
    if (typeof v === "string" && v) return v;
  }
  return "";
}

export function globSearchPaths(input: Record<string, unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: string) => {
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  };
  push(inputPath(input));
  for (const key of ["pattern", "glob", "glob_pattern"]) {
    const v = input[key];
    if (typeof v === "string" && /^(?:\.\/)?beads(?:\/|$)/.test(v)) push(v);
  }
  return out;
}

