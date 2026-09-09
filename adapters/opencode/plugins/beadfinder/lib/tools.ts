// Harness-specific tool names/paths. Shared tokenizer lives in core/lib.
export {
  applyPatchPaths,
  bashCommand,
  firstBdInvocation,
  flagValue,
  hasFlag,
  hitlInText,
  isSystemAgent,
  labelBlob,
  looksLikeMutatingBash,
  looksLikeProductWriteBash,
  SNAPSHOT_PREFIX,
  spawnContract,
  spawnText,
  tokenize,
} from "../../../../../core/lib/tools-core.ts";

import { applyPatchPaths } from "../../../../../core/lib/tools-core.ts";

const WRITE_TOOLS = new Set(["write", "edit", "multiedit", "apply_patch"]);
const READ_TOOLS = new Set(["read"]);
const BASH_TOOLS = new Set(["bash", "shell"]);
const SPAWN_TOOLS = new Set(["task", "spawn", "subagent", "agent"]);
const GLOB_TOOLS = new Set(["glob", "grep", "search", "list", "list_dir", "ls"]);
const PATH_KEYS = ["path", "filePath", "file_path", "filename", "target_directory", "targetDirectory"];

export function toolName(event: { tool?: string; toolName?: string }): string {
  return String(event.tool || event.toolName || "").toLowerCase();
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

export function toolPaths(name: string, input: Record<string, unknown>): string[] {
  if (name === "apply_patch") {
    const text = typeof input.patchText === "string" ? input.patchText : "";
    return applyPatchPaths(text);
  }
  const fromGlob = globSearchPaths(input);
  if (fromGlob.length) return fromGlob;
  const p = inputPath(input);
  return p ? [p] : [];
}

