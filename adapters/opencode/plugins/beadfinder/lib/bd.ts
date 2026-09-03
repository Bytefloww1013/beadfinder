import { loadState, saveState, type Persona } from "./state.ts";
import { flagValue, hasFlag, tokenize } from "./tools.ts";
import { spawn } from "node:child_process";

export { firstBdInvocation } from "./tools.ts";

export type BdIssue = {
  id?: string;
  title?: string;
  status?: string;
  issue_type?: string;
  type?: string;
  labels?: string[] | string;
  closed_at?: string;
};

export function labelsOf(issue: BdIssue): string[] {
  if (Array.isArray(issue.labels)) return issue.labels.map(String);
  if (typeof issue.labels === "string") return issue.labels.split(/[,\s]+/).filter(Boolean);
  return [];
}

export function isClosedStatus(status: string | undefined): boolean {
  const s = (status || "").toLowerCase();
  return s === "closed" || s === "done" || s === "complete" || s === "completed";
}

export function isLiveStatus(status: string | undefined): boolean {
  const s = (status || "").toLowerCase();
  if (!s) return true;
  return !isClosedStatus(s);
}

export function personaFromRoleLabel(label: string): Persona | "" {
  switch (label) {
    case "wayfinder":
    case "wayfind":
      return "wayfinder";
    case "architect":
    case "architecture":
      return "architect";
    case "research":
      return "research";
    case "implementation":
      return "implementer";
    case "review":
      return "reviewer";
    case "product":
      return "product";
    default:
      return "";
  }
}

export function personaFromArg(value: string): Persona | "" {
  const v = (value || "").toLowerCase();
  if (v === "wayfinder" || v === "architect" || v === "research" || v === "implementer" || v === "reviewer" || v === "product") {
    return v;
  }
  return personaFromRoleLabel(v);
}

export function parseClaimNextArgs(cmd: string): { parent: string; persona: Persona | "" } {
  const tokens = tokenize(cmd);
  const parent = flagValue(tokens, "--parent");
  const persona = personaFromArg(flagValue(tokens, "--persona"));
  return { parent, persona };
}

export function isClaimNext(cmd: string): boolean {
  return /claim-next\.sh\b/.test(cmd);
}

export function isSessionBoot(cmd: string): boolean {
  return /session-boot\.sh\b/.test(cmd);
}

export function isFrontier(cmd: string): boolean {
  return /frontier\.sh\b/.test(cmd);
}

export function isAppendDecision(cmd: string): boolean {
  return /append-decision\.py\b/.test(cmd);
}

const BD_TIMEOUT_MS = 20_000;

export function runBd(cwd: string, args: string[]): Promise<{ ok: boolean; raw: string; json: unknown }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: { ok: boolean; raw: string; json: unknown }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let child;
    try {
      child = spawn("bd", args, { cwd, env: process.env });
    } catch (err) {
      finish({ ok: false, raw: String(err), json: null });
      return;
    }

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += d;
    });
    child.stderr?.on("data", (d) => {
      stderr += d;
    });
    child.on("error", (err) => {
      finish({ ok: false, raw: String(err), json: null });
    });
    child.on("close", (code) => {
      const raw = String(stdout || stderr || "").trim();
      if ((code || 0) !== 0) {
        finish({ ok: false, raw, json: null });
        return;
      }
      if (!raw) {
        finish({ ok: true, raw: "", json: null });
        return;
      }
      try {
        finish({ ok: true, raw, json: JSON.parse(raw) });
      } catch {
        finish({ ok: true, raw, json: null });
      }
    });

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      finish({ ok: false, raw: "bd timed out", json: null });
    }, BD_TIMEOUT_MS);
    timer.unref?.();
  });
}

export function asIssues(json: unknown): BdIssue[] {
  if (!json) return [];
  if (Array.isArray(json)) return json.filter((i) => i && typeof i === "object") as BdIssue[];
  if (typeof json === "object") {
    const o = json as Record<string, unknown>;
    for (const key of ["issues", "items", "data"]) {
      if (Array.isArray(o[key])) return asIssues(o[key]);
    }
    if (o.issue && typeof o.issue === "object") return asIssues(o.issue);
    if (o.id || o.title || o.status) return [json as BdIssue];
  }
  return [];
}

export function issueId(issue: BdIssue): string {
  return String(issue.id || "");
}

export function mergeIssues(...lists: BdIssue[][]): BdIssue[] {
  const seen = new Map<string, BdIssue>();
  for (const list of lists) {
    for (const issue of list) {
      const id = issueId(issue);
      if (!id || seen.has(id)) continue;
      seen.set(id, issue);
    }
  }
  return [...seen.values()];
}

/**
 * Live = open + in_progress. Beads takes comma-separated --status;
 * repeating --status overwrites. Fall back to two queries on older CLIs.
 */
export async function listLive(cwd: string, args: string[]): Promise<BdIssue[]> {
  const combined = await runBd(cwd, [...args, "--status", "open,in_progress", "--json"]);
  if (combined.ok) {
    return asIssues(combined.json).filter((i) => isLiveStatus(i.status));
  }
  const buckets: BdIssue[][] = [];
  for (const status of ["open", "in_progress"]) {
    const res = await runBd(cwd, [...args, "--status", status, "--json"]);
    buckets.push(asIssues(res.json).filter((i) => isLiveStatus(i.status)));
  }
  return mergeIssues(...buckets);
}

export function formatSnapshot(issues: BdIssue[], heading: string): string {
  if (!issues.length) return `${heading}: none`;
  return (
    heading +
    ":\n" +
    issues
      .slice(0, 12)
      .map((i) => `- ${issueId(i)} [${i.status || "?"}] ${i.title || ""}`)
      .join("\n")
  );
}

export function rememberScriptContext(cwd: string, sessionID: string, cmd: string): void {
  const state = loadState(cwd, sessionID);
  if (isSessionBoot(cmd) || isClaimNext(cmd) || isFrontier(cmd)) {
    const parsed = parseClaimNextArgs(cmd);
    if (parsed.persona) state.persona = parsed.persona;
    if (parsed.parent) state.parent = parsed.parent;
  }
  const argv = tokenize(cmd);
  if (argv.includes("bd") && hasFlag(argv, "--claim")) {
    const id = argv.find((t, i) => i > 0 && argv[i - 1] === "update") || "";
    if (id && !id.startsWith("-")) {
      state.claimedId = id;
      state.claimedAt = new Date().toISOString();
      state.claimsThisSession += 1;
    }
  }
  saveState(cwd, sessionID, state);
}

export function extractFirstId(text: string): string {
  try {
    const json = JSON.parse(text);
    const issues = asIssues(json);
    if (issues[0]) return issueId(issues[0]);
  } catch {
    /* not json */
  }
  const m = text.match(/\b([a-z][a-z0-9]*-[a-z0-9-]*\.\d+(?:\.\d+)*|[a-z][a-z0-9]*-\d+(?:\.\d+)*)\b/i);
  return m ? m[1] : "";
}

export function findClosedMentions(text: string): string[] {
  const ids: string[] = [];
  const re = /"id"\s*:\s*"([^"]+)".{0,120}"status"\s*:\s*"(closed|done|complete)"/gis;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) ids.push(m[1]);
  return ids;
}

export function modeFromLabels(labels: string[]): "hitl" | "afk" | "" {
  const blob = labels.join(" ").toLowerCase();
  if (/\bhitl\b/.test(blob) || /beadfinder:grill/.test(blob)) return "hitl";
  if (/\bafk\b/.test(blob)) return "afk";
  return "";
}
