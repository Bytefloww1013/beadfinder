import { readJson, statePath, writeJson } from "./fsutil.ts";

export type Persona =
  | "wayfinder"
  | "architect"
  | "implementer"
  | "reviewer"
  | "product"
  | "research"
  | "unknown";

export type SessionState = {
  persona: Persona;
  parent: string;
  claimedId: string;
  claimedAt: string;
  mode: "hitl" | "afk" | "";
  claimsThisSession: number;
  lastClaimedNonResearch: boolean;
  frontierEmpty: boolean;
  mutatingTools: number;
  lastRefreshAt: number;
  lastSnapshot: string;
  seenClosed: Record<string, string>;
};

export const emptyState = (): SessionState => ({
  persona: "unknown",
  parent: "",
  claimedId: "",
  claimedAt: "",
  mode: "",
  claimsThisSession: 0,
  lastClaimedNonResearch: false,
  frontierEmpty: false,
  mutatingTools: 0,
  lastRefreshAt: 0,
  lastSnapshot: "",
  seenClosed: {},
});

export function loadState(cwd: string): SessionState {
  return { ...emptyState(), ...readJson(statePath(cwd), emptyState()) };
}

export function saveState(cwd: string, state: SessionState): void {
  writeJson(statePath(cwd), state);
}

export function recordClosed(cwd: string, id: string): SessionState {
  const state = loadState(cwd);
  if (id) state.seenClosed[id] = new Date().toISOString();
  if (state.claimedId === id) {
    state.claimedId = "";
    state.claimedAt = "";
  }
  saveState(cwd, state);
  return state;
}
