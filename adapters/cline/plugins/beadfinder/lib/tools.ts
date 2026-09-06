const WRITE_TOOLS = new Set(["write", "edit", "multiedit", "apply_patch", "write_to_file", "replace_in_file", "editor", "new_empty_file"]);
const READ_TOOLS = new Set(["read", "read_file", "read_files", "open_file"]);
const BASH_TOOLS = new Set(["bash", "shell", "terminal", "execute_command", "run_commands"]);
const SPAWN_TOOLS = new Set(["task", "spawn", "subagent", "agent", "spawn_agent", "start_subagent", "team_run_task"]);
const GLOB_TOOLS = new Set(["glob", "grep", "search", "list", "list_dir", "ls", "search_codebase", "list_files", "find_files"]);
const PATH_KEYS = ["path", "filePath", "file_path", "filename", "file", "target_directory", "targetDirectory"];
const SYSTEM_AGENTS = new Set(["title", "summary", "compaction"]);

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

export function isSystemAgent(name: string): boolean {
  return SYSTEM_AGENTS.has((name || "").toLowerCase());
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

/** Paths listed in an OpenCode apply_patch payload. */
export function applyPatchPaths(patchText: string): string[] {
  if (!patchText) return [];
  const out: string[] = [];
  const re = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(patchText))) {
    const p = (m[1] || "").trim();
    if (p) out.push(p);
  }
  if (out.length === 0) {
    const diffRe = /^(?:---|\+\+\+)\s+[ab]\/(.+)$/gm;
    while ((m = diffRe.exec(patchText))) {
      const p = (m[1] || "").trim();
      if (p && !out.includes(p)) out.push(p);
    }
  }
  return out;
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

export function bashCommand(input: Record<string, unknown>): string {
  for (const key of ["command", "cmd", "script"]) {
    const v = input[key];
    if (typeof v === "string") return v;
  }
  if (Array.isArray(input.commands)) {
    return input.commands.filter((c) => typeof c === "string").join(" && ");
  }
  return "";
}

export function spawnText(input: Record<string, unknown>): string {
  const chunks: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") chunks.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v as object).forEach(walk);
  };
  walk(input);
  return chunks.join("\n");
}

export function looksLikeMutatingBash(cmd: string): boolean {
  return (
    /\b(rm|mv|sed|perl|python3?|node|ruby)\b/.test(cmd) &&
    /(>|>>|tee\b|-i\b|writeFile|open\([^)]*['"]w)/.test(cmd)
  );
}

export function looksLikeProductWriteBash(cmd: string): boolean {
  if (!looksLikeMutatingBash(cmd) && !/\b(cat|tee|printf)\b.*>/.test(cmd)) return false;
  return /(^|[\s/'"])(src|lib|app|apps|packages|backend|frontend|server|client)\//.test(cmd);
}

/** Split a shell line into argv-ish tokens. Good enough for bd/git guards. */
export function tokenize(cmd: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|`([^`]*)`|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cmd))) {
    out.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

export function firstBdInvocation(cmd: string): string[] | null {
  const lines = cmd.split(/\n|;|&&|\|\|/).map((s) => s.trim()).filter(Boolean);
  for (const line of lines) {
    const tokens = tokenize(line.replace(/^\s*\d*\s*>\s*/, ""));
    const idx = tokens.findIndex((t) => t === "bd" || t.endsWith("/bd"));
    if (idx >= 0) return tokens.slice(idx);
  }
  return null;
}

export function flagValue(argv: string[], name: string): string {
  const i = argv.findIndex((t) => t === name || t.startsWith(name + "="));
  if (i < 0) return "";
  const tok = argv[i];
  if (tok.startsWith(name + "=")) return tok.slice(name.length + 1);
  return argv[i + 1] || "";
}

export function hasFlag(argv: string[], name: string): boolean {
  return argv.some((t) => t === name || t.startsWith(name + "="));
}

export function labelBlob(argv: string[]): string {
  const bits: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-l" || argv[i] === "--label") bits.push(argv[i + 1] || "");
    if (argv[i].startsWith("--label=")) bits.push(argv[i].slice(8));
  }
  return bits.join(",");
}

export function hitlInText(text: string): boolean {
  return /\bhitl\b/i.test(text) || /beadfinder:grill/i.test(text) || /\bgrill ticket\b/i.test(text);
}

export function spawnContract(text: string): { ok: boolean; hasId: boolean; hasOne: boolean; hasClaim: boolean } {
  const hasId = /\bbd-[a-z0-9._-]+|\b[a-z]+-\d+|\b[a-z][a-z0-9-]*\.\d+/i.test(text);
  const hasOne = /one ticket only/i.test(text);
  const hasClaim = /claim before work/i.test(text);
  return { ok: !!(text && hasId && hasOne && hasClaim), hasId, hasOne, hasClaim };
}

export const SNAPSHOT_PREFIX = "Live Beads snapshot (do not trust earlier chat for ticket status):";
