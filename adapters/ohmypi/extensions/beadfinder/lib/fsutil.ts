import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";

export function ompRoot(cwd: string): string {
  return join(cwd, ".omp");
}

export function packStateDir(cwd: string): string {
  return join(ompRoot(cwd), "beadfinder");
}

export function statePath(cwd: string): string {
  return join(packStateDir(cwd), "state.json");
}

export function debugLogPath(cwd: string): string {
  return join(ompRoot(cwd), "beadfinder-debug.log");
}

export function debugSkillInstalled(cwd: string, home = process.env.HOME || ""): boolean {
  const local = join(cwd, ".omp", "skills", "beadfinder-debug", "SKILL.md");
  const global = join(home, ".omp", "agent", "skills", "beadfinder-debug", "SKILL.md");
  return existsSync(local) || existsSync(global);
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
