// Harness-specific tool names/paths. Shared tokenizer lives in core/lib.
export {
  applyPatchPaths,
  bashCommand,
  firstBdInvocation,
  flagValue,
  hasFlag,
  hitlInText,
  labelBlob,
  looksLikeMutatingBash,
  looksLikeProductWriteBash,
  isSystemAgent,
  SNAPSHOT_PREFIX,
  spawnContract,
  spawnText,
  tokenize,
} from "../../../../../core/lib/tools-core.ts";

import { applyPatchPaths } from "../../../../../core/lib/tools-core.ts";

const WRITE_TOOLS = new Set(["write", "edit", "multiedit", "apply_patch", "write_to_file", "replace_in_file", "editor", "new_empty_file"]);
const READ_TOOLS = new Set(["read", "read_file", "read_files", "open_file"]);
const BASH_TOOLS = new Set(["bash", "shell", "terminal", "execute_command", "run_commands"]);
const SPAWN_TOOLS = new Set(["task", "spawn", "subagent", "agent", "spawn_agent", "start_subagent", "team_run_task"]);
const GLOB_TOOLS = new Set(["glob", "grep", "search", "list", "list_dir", "ls", "search_codebase", "list_files", "find_files"]);
const PATH_KEYS = ["path", "filePath", "file_path", "filename", "file", "target_directory", "targetDirectory"];

export function toolName(event: { tool?: string; toolName?: string; name?: string }): string {
  return String(event.tool || event.toolName || event.name || "").toLowerCase();
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
  return (
    SPAWN_TOOLS.has(name) ||
    name.startsWith("subagent_") ||
    name.includes("spawn") ||
    name.includes("task")
  );
}

export function isGlobTool(name: string): boolean {
  return GLOB_TOOLS.has(name) || name.includes("glob");
}

export function inputPath(input: Record<string, unknown>): string {
  for (const key of PATH_KEYS) {
    const v = input[key];
    if (typeof v === "string" && v) return v;
  }
  if (Array.isArray(input.files)) {
    for (const item of input.files) {
      if (item && typeof item === "object") {
        const p = inputPath(item as Record<string, unknown>);
        if (p) return p;
      }
    }
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
  for (const key of ["pattern", "glob", "glob_pattern", "query", "path"]) {
    const v = input[key];
    if (typeof v === "string" && /^(?:\.\/)?beads(?:\/|$)/.test(v)) push(v);
  }
  if (Array.isArray(input.queries)) {
    for (const q of input.queries) {
      if (typeof q === "string" && /^(?:\.\/)?beads(?:\/|$)/.test(q)) push(q);
    }
  }
  return out;
}

export function toolPaths(name: string, input: Record<string, unknown>): string[] {
  if (name === "apply_patch" || typeof input.patchText === "string" || typeof input.patch === "string") {
    const text = typeof input.patchText === "string" ? input.patchText : (typeof input.patch === "string" ? input.patch : "");
    const extracted = applyPatchPaths(text);
    if (extracted.length) return extracted;
  }
  if (Array.isArray(input.files)) {
    const fromFiles: string[] = [];
    for (const item of input.files) {
      if (item && typeof item === "object") {
        const p = inputPath(item as Record<string, unknown>);
        if (p) fromFiles.push(p);
      }
    }
    if (fromFiles.length) return fromFiles;
  }
  const fromGlob = globSearchPaths(input);
  if (fromGlob.length) return fromGlob;
  const p = inputPath(input);
  return p ? [p] : [];
}

