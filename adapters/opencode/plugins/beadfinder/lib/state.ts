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
  booted: boolean;
};

export type Store = {
  sessions: Record<string, SessionState>;
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
  booted: false,
});

function emptyStore(): Store {
  return { sessions: {} };
}

function loadStore(cwd: string): Store {
  const raw = readJson<Store | SessionState>(cwd ? statePath(cwd) : "", emptyStore());
  if (raw && typeof raw === "object" && "sessions" in raw && raw.sessions && typeof raw.sessions === "object") {
    return raw as Store;
  }
  // migrate a flat OMP-shaped file if someone copied one over
  if (raw && typeof raw === "object" && ("persona" in raw || "claimedId" in raw)) {
    return { sessions: { default: { ...emptyState(), ...(raw as SessionState) } } };
  }
  return emptyStore();
}

export function loadState(cwd: string, sessionID = "default"): SessionState {
  const store = loadStore(cwd);
  return { ...emptyState(), ...(store.sessions[sessionID] || {}) };
}

export function saveState(cwd: string, sessionID: string, state: SessionState): void {
  const store = loadStore(cwd);
  store.sessions[sessionID] = state;
  writeJson(statePath(cwd), store);
}

export function recordClosed(cwd: string, sessionID: string, id: string): SessionState {
  const state = loadState(cwd, sessionID);
  if (id) state.seenClosed[id] = new Date().toISOString();
  if (state.claimedId === id) {
    state.claimedId = "";
    state.claimedAt = "";
  }
  saveState(cwd, sessionID, state);
  return state;
}
