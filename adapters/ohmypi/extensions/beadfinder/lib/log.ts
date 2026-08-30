import { appendLine, debugForced, debugLogPath, debugSkillInstalled, debugVerbose } from "./fsutil.ts";

export type LogLevel = "error" | "warning" | "concern" | "info";
export type LogSource = "hook" | "agent" | "advisor";

export function debugEnabled(cwd: string): boolean {
  return debugForced() || debugSkillInstalled(cwd);
}

export function debugLog(
  cwd: string,
  entry: {
    level: LogLevel;
    source: LogSource;
    hook?: string;
    message: string;
    details?: unknown;
  },
): void {
  if (!debugEnabled(cwd)) return;
  if (entry.level === "info" && !debugVerbose()) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: entry.level,
    source: entry.source,
    hook: entry.hook || "",
    message: entry.message,
    details: entry.details ?? null,
  });
  try {
    appendLine(debugLogPath(cwd), line);
  } catch {
    // never break the session over a log write
  }
}

export function advisor(
  cwd: string,
  hook: string,
  level: LogLevel,
  message: string,
  details?: unknown,
): void {
  debugLog(cwd, { level, source: "advisor", hook, message, details });
}
