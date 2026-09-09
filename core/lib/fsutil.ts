import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";

/**
 * Host harness dot-dir for per-workspace beadfinder state.
 *
 * Copied into the installed plugin lib by install.sh (adapters are shims
 * only). Cannot hardcode one harness's dot-dir.
 * Resolution order:
 *   1. BEADFINDER_HOST_DIR env override (dir name or absolute path) — the
 *      escape hatch for --global installs, where the harness dot-dir lives
 *      outside the workspace.
 *   2. the first host dir that already carries a beadfinder/ state dir
 *      (preserves session continuity when several harnesses share a repo),
 *   3. the first host dot-dir that exists in cwd (install.sh creates the
 *      harness dot-dir on local installs),
 *   4. fallback ".opencode".
 */
const HOST_DIRS = [".cline", ".opencode", ".omp"];

export function hostRoot(cwd: string): string {
  const override = (process.env.BEADFINDER_HOST_DIR || "").trim();
  if (override) return override.startsWith(".") ? join(cwd, override) : override;
  for (const d of HOST_DIRS) {
    if (existsSync(join(cwd, d, "beadfinder"))) return join(cwd, d);
  }
  for (const d of HOST_DIRS) {
    if (existsSync(join(cwd, d))) return join(cwd, d);
  }
  return join(cwd, ".opencode");
}

export function packStateDir(cwd: string): string {
  return join(hostRoot(cwd), "beadfinder");
}

export function statePath(cwd: string): string {
  return join(packStateDir(cwd), "state.json");
}

export function debugLogPath(cwd: string): string {
  return join(hostRoot(cwd), "beadfinder-debug.log");
}

export function debugSkillInstalled(cwd: string, home = process.env.HOME || ""): boolean {
  const candidates = [
    join(cwd, ".cline", "skills", "beadfinder-debug", "SKILL.md"),
    join(cwd, ".opencode", "skills", "beadfinder-debug", "SKILL.md"),
    join(cwd, ".omp", "skills", "beadfinder-debug", "SKILL.md"),
    join(home, ".cline", "skills", "beadfinder-debug", "SKILL.md"),
    join(home, ".config", "opencode", "skills", "beadfinder-debug", "SKILL.md"),
    join(home, ".omp", "agent", "skills", "beadfinder-debug", "SKILL.md"),
  ];
  return candidates.some((p) => existsSync(p));
}

export function hooksDisabled(): boolean {
  const v = (process.env.BEADFINDER_HOOKS || "").toLowerCase();
  return v === "off" || v === "0" || v === "false";
}

export function debugForced(): boolean {
  const v = (process.env.BEADFINDER_DEBUG || "").toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "verbose";
}

export function debugVerbose(): boolean {
  return (process.env.BEADFINDER_DEBUG || "").toLowerCase() === "verbose";
}

export function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(filePath: string, value: unknown): void {
  ensureDir(filePath);
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export function appendLine(filePath: string, line: string): void {
  ensureDir(filePath);
  appendFileSync(filePath, line.endsWith("\n") ? line : line + "\n", "utf8");
}

export function absFrom(cwd: string, p: string): string {
  return resolve(cwd, p);
}

export function posixish(p: string): string {
  return normalize(p).split(sep).join("/");
}

export function relToCwd(cwd: string, p: string): string {
  const rel = relative(cwd, absFrom(cwd, p));
  return posixish(rel || ".");
}
