/**
 * Shared, host-agnostic tokenizer/argv helpers for the tools.ts layer.
 *
 * Copied into the installed plugin lib by install.sh. Keep this file pure:
 * no host imports, no host-specific tool-name sets, no I/O. Each adapter's
 * tools.ts re-exports the subset it exposes; tool-name classification sets
 * and input-shape helpers stay per-adapter because they differ per harness.
 *
 * Documented parser behavior (pinned by tests):
 * - stripShellComments removes `# ...` to end-of-line when `#` is not inside
 *   single/double quotes and is not backslash-escaped. Quoted hashes survive
 *   (`bd update -d "foo # bar"`). A naive `(^|[^\\])#.*$` is intentionally
 *   not used — it would clobber hashes inside quotes.
 * - Compound commands split on `\n`, `;`, `&&`, and `||`. Never on a lone
 *   `&` (that would break `2>&1`) and never on a lone `|` as a *split*
 *   boundary (the pipe stays in the token stream).
 * - allBdInvocations collects every `bd` or path-ending-in-/bd argv after
 *   comment stripping. A `|` after bd truncates that argv (bd list | jq →
 *   ["bd","list"]); a bd after a pipe is still captured
 *   (echo x | bd close id → ["bd","close","id"]).
 * - firstBdInvocation is the first allBdInvocations result (so comments are
 *   stripped there too). It strips one leading redirect prefix (`2> file`,
 *   `> f`). Historically the returned slice kept a trailing `|`; slicing
 *   stops before `|` now (security/clarity). `echo hi | bd list` is still
 *   `["bd","list"]`.
 * - flagValue accepts both `--flag value` and `--flag=value`; when a flag is
 *   repeated, the LAST occurrence wins (shell/CLI convention).
 * - hasFlag/flagValue do not honor a `--` end-of-options terminator; a flag
 *   after `--` still matches (known limitation, pinned by tests).
 */

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

/** `# ...` to EOL, unless the hash is quoted or backslash-escaped. */
export function stripShellComments(cmd: string): string {
  let out = "";
  let quote: "'" | '"' | "" = "";
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote === "'") {
      out += c;
      if (c === "'") quote = "";
      continue;
    }
    if (quote === '"') {
      if (c === "\\" && i + 1 < cmd.length) {
        out += c + cmd[i + 1];
        i++;
        continue;
      }
      out += c;
      if (c === '"') quote = "";
      continue;
    }
    if (c === "\\" && i + 1 < cmd.length) {
      out += c + cmd[i + 1];
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      out += c;
      continue;
    }
    if (c === "#") {
      while (i < cmd.length && cmd[i] !== "\n") i++;
      if (i < cmd.length && cmd[i] === "\n") out += "\n";
      continue;
    }
    out += c;
  }
  return out;
}

const COMPOUND_SPLIT = /\n|;|&&|\|\|/;

function stripLeadingRedirect(segment: string): string {
  return segment.replace(/^\s*\d*\s*>\s*/, "");
}

function pipelineStages(tokens: string[]): string[][] {
  const stages: string[][] = [];
  let cur: string[] = [];
  for (const t of tokens) {
    if (t === "|") {
      stages.push(cur);
      cur = [];
    } else {
      cur.push(t);
    }
  }
  stages.push(cur);
  return stages;
}

function bdArgvFromStage(stage: string[]): string[] | null {
  const idx = stage.findIndex((t) => t === "bd" || t.endsWith("/bd"));
  if (idx < 0) return null;
  return stage.slice(idx);
}

/** Every `bd` argv in a compound command (comments stripped; pipes truncate). */
export function allBdInvocations(cmd: string): string[][] {
  const clean = stripShellComments(cmd);
  const out: string[][] = [];
  for (const segment of clean.split(COMPOUND_SPLIT).map((s) => s.trim()).filter(Boolean)) {
    const tokens = tokenize(stripLeadingRedirect(segment));
    for (const stage of pipelineStages(tokens)) {
      const argv = bdArgvFromStage(stage);
      if (argv) out.push(argv);
    }
  }
  return out;
}

export function firstBdInvocation(cmd: string): string[] | null {
  return allBdInvocations(cmd)[0] ?? null;
}

export function flagValue(argv: string[], name: string): string {
  // Scan backwards so the last occurrence of a repeated flag wins.
  for (let i = argv.length - 1; i >= 0; i--) {
    const tok = argv[i];
    if (tok === name) return argv[i + 1] || "";
    if (tok.startsWith(name + "=")) return tok.slice(name.length + 1);
  }
  return "";
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

/** Paths listed in an apply_patch payload. */
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

export function looksLikeMutatingBash(cmd: string): boolean {
  return (
    /\b(rm|mv|sed|perl|python3?|node|ruby)\b/.test(cmd) &&
    /(>|>>|tee\b|-i\b|writeFile|open\([^)]*['"]w)/.test(cmd)
  );
}

/** Planning-doc destinations: docs/, references/, spikes/, any adr/ segment, root *.md. */
function looksLikePlanningDocsPath(cmd: string): boolean {
  if (/(?:^|[\s'"])(?:\.\/)?(?:docs|references|spikes)\//i.test(cmd)) return true;
  if (/\/adr\//i.test(cmd)) return true;
  // Root markdown only: prefix is start/whitespace/redirect, never `/`.
  if (/(?:^|[\s>'"])(?:\.\/)?(?:SPEC|ARCHITECTURE|IMPLEMENTATION|README|[A-Za-z0-9._-]+)\.md\b/i.test(cmd)) {
    return true;
  }
  return false;
}

export function looksLikeProductWriteBash(cmd: string): boolean {
  if (!looksLikeMutatingBash(cmd) && !/\b(cat|tee|printf|echo)\b.*>/.test(cmd)) return false;
  // Known product prefixes stay product writes even if a planning path also appears.
  if (/(^|[\s/'"])(src|lib|app|apps|packages|backend|frontend|server|client)\//.test(cmd)) return true;
  // Mutating write with no identifiable product prefix: product unless planning docs.
  if (looksLikePlanningDocsPath(cmd)) return false;
  return true;
}

const SYSTEM_AGENTS = new Set(["title", "summary", "compaction"]);

export function isSystemAgent(name: string): boolean {
  return SYSTEM_AGENTS.has((name || "").toLowerCase());
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

/** Canonical superset of tool names across all supported harnesses. Fail closed. */
export const WRITE_TOOLS = new Set([
  "write",
  "edit",
  "multiedit",
  "apply_patch",
  "write_to_file",
  "replace_in_file",
  "editor",
  "new_empty_file",
]);

export const READ_TOOLS = new Set(["read", "read_file", "read_files", "open_file"]);

export const BASH_TOOLS = new Set(["bash", "shell", "terminal", "execute_command", "run_commands"]);

export const SPAWN_TOOLS = new Set([
  "task",
  "spawn",
  "subagent",
  "agent",
  "spawn_agent",
  "start_subagent",
  "team_run_task",
]);

export const GLOB_TOOLS = new Set([
  "glob",
  "grep",
  "search",
  "list",
  "list_dir",
  "ls",
  "search_codebase",
  "list_files",
  "find_files",
]);

export const PATH_KEYS = ["path", "filePath", "file_path", "filename", "file", "target_directory", "targetDirectory"];

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

/** Canonical path extractor: handles apply_patch (patchText and patch), files[], glob patterns, and single path keys. */
export function toolPaths(name: string, input: Record<string, unknown>): string[] {
  if (name === "apply_patch" || typeof input.patchText === "string" || typeof input.patch === "string") {
    const text =
      typeof input.patchText === "string" ? input.patchText : typeof input.patch === "string" ? input.patch : "";
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
