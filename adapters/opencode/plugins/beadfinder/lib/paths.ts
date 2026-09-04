import { posixish, relToCwd } from "./fsutil.ts";
import type { Persona } from "./state.ts";

const PROTECTED_FRAGMENTS = [
  ".env",
  ".env.",
  "/.git/",
  "/node_modules/",
  "/.ssh/",
  "id_rsa",
  "id_ed25519",
  ".pem",
  "credentials.json",
  "secrets.json",
];

const BEADS_OK = [
  ".beads/",
  ".opencode/beadfinder/",
  ".opencode/beadfinder-debug.log",
  ".omp/beadfinder/",
  ".omp/beadfinder-debug.log",
];

const PRODUCT_PREFIXES = [
  "src/",
  "lib/",
  "app/",
  "apps/",
  "packages/",
  "backend/",
  "frontend/",
  "server/",
  "client/",
  "cmd/",
  "internal/",
];

export function isProtectedPath(cwd: string, p: string): boolean {
  const rel = "/" + posixish(relToCwd(cwd, p));
  const raw = posixish(p);
  const hay = (rel + " " + raw).toLowerCase();
  if (hay.includes("/.env") || hay.endsWith(".env") || hay.includes(".env.")) return true;
  return PROTECTED_FRAGMENTS.some((frag) => hay.includes(frag.toLowerCase()));
}

export function isBeadsPath(cwd: string, p: string): boolean {
  const rel = posixish(relToCwd(cwd, p));
  return BEADS_OK.some((ok) => rel.startsWith(ok) || rel === ok.replace(/\/$/, ""));
}

/** `beads/` without the leading dot. The database is `.beads/`. */
export function isBareBeadsPath(cwd: string, p: string): boolean {
  if (!p) return false;
  const rel = posixish(relToCwd(cwd, p)).replace(/^\.\//, "").replace(/\/$/, "");
  const first = rel.split("/")[0];
  if (first === "beads") return true;
  const raw = posixish(p).replace(/^\.\//, "").replace(/\/$/, "");
  return raw === "beads" || raw.startsWith("beads/");
}

export function isProductPath(cwd: string, p: string): boolean {
  const rel = posixish(relToCwd(cwd, p));
  if (
    rel.startsWith(".beads/") ||
    rel.startsWith(".omp/") ||
    rel.startsWith(".opencode/") ||
    rel.startsWith(".git/")
  ) {
    return false;
  }
  if (/\.(md|txt|json)$/.test(rel) && !rel.includes("/")) return false;
  return PRODUCT_PREFIXES.some((pre) => rel.startsWith(pre));
}

export function isTrackerSidecar(cwd: string, p: string): boolean {
  const rel = posixish(relToCwd(cwd, p)).toLowerCase();
  const base = rel.split("/").pop() || rel;
  return (
    base === "todo.md" ||
    base === "todos.md" ||
    base === "issues.md" ||
    rel.startsWith(".github/issue") ||
    rel === "git-issues.md"
  );
}

export function isLikelyAdrPath(cwd: string, p: string): boolean {
  const rel = posixish(relToCwd(cwd, p)).toLowerCase();
  return rel.includes("/adr") || rel.includes("adr/") || /(^|\/)adr[-_]/.test(rel);
}

export function personaWall(cwd: string, persona: Persona, path: string): string {
  if (isProtectedPath(cwd, path)) return `Protected path: ${path}`;
  if (isTrackerSidecar(cwd, path)) return `Do not invent a second tracker (${path}). File a bead.`;
  const product = isProductPath(cwd, path);
  const adr = isLikelyAdrPath(cwd, path);
  switch (persona) {
    case "wayfinder":
    case "product":
    case "research":
      if (product) return `${persona} may not edit product files (${path}).`;
      return "";
    case "architect":
      if (product && !adr) return `architect may not land production features (${path}).`;
      return "";
    case "reviewer":
      if (product) return `reviewer may not patch product files (${path}). File a blocker bead.`;
      return "";
    case "implementer":
      return "";
    default:
      if (isProtectedPath(cwd, path)) return `Protected path: ${path}`;
      return "";
  }
}
