import { describe, expect, test } from "bun:test";
import {
  isBareBeadsPath,
  isBeadsPath,
  isLikelyAdrPath,
  isProductPath,
  isProtectedPath,
  isTrackerSidecar,
  personaWall,
} from "../../core/lib/paths.ts";

const cwd = "/tmp/beadfinder-paths-test-repo";

describe("isProductPath default-deny", () => {
  test("treats source trees and root source as product", () => {
    expect(isProductPath(cwd, "src/app.ts")).toBe(true);
    expect(isProductPath(cwd, "lib/util.ts")).toBe(true);
    expect(isProductPath(cwd, "cmd/root.go")).toBe(true);
    expect(isProductPath(cwd, "internal/auth/auth.go")).toBe(true);
    expect(isProductPath(cwd, "main.py")).toBe(true);
    expect(isProductPath(cwd, "index.ts")).toBe(true);
    expect(isProductPath(cwd, "server.go")).toBe(true);
    expect(isProductPath(cwd, "app.py")).toBe(true);
    expect(isProductPath(cwd, "pkg/api/server.go")).toBe(true);
    expect(isProductPath(cwd, "services/billing/handler.py")).toBe(true);
    expect(isProductPath(cwd, "scripts/migrate.py")).toBe(true);
    expect(isProductPath(cwd, "package.json")).toBe(true);
    expect(isProductPath(cwd, "tsconfig.json")).toBe(true);
    expect(isProductPath(cwd, "go.mod")).toBe(true);
  });

  test("allows planning docs, ADRs, and harness dirs", () => {
    expect(isProductPath(cwd, "docs/guide.md")).toBe(false);
    expect(isProductPath(cwd, "docs/adr/001.md")).toBe(false);
    expect(isProductPath(cwd, "references/foo.md")).toBe(false);
    expect(isProductPath(cwd, "spikes/spike-1.md")).toBe(false);
    expect(isProductPath(cwd, "SPEC.md")).toBe(false);
    expect(isProductPath(cwd, "ARCHITECTURE.md")).toBe(false);
    expect(isProductPath(cwd, "IMPLEMENTATION.md")).toBe(false);
    expect(isProductPath(cwd, "README.md")).toBe(false);
    expect(isProductPath(cwd, ".beads/issues.jsonl")).toBe(false);
    expect(isProductPath(cwd, ".opencode/plugins/beadfinder.ts")).toBe(false);
    expect(isProductPath(cwd, ".cline/x")).toBe(false);
    expect(isProductPath(cwd, ".omp/x")).toBe(false);
    expect(isProductPath(cwd, ".git/hooks/pre-commit")).toBe(false);
  });
});

describe("personaWall", () => {
  test("blocks non-implementers from product source", () => {
    expect(personaWall(cwd, "reviewer", "src/foo.ts")).toMatch(/reviewer may not patch/);
    expect(personaWall(cwd, "reviewer", "main.py")).toMatch(/reviewer may not patch/);
    expect(personaWall(cwd, "wayfinder", "src/foo.ts")).toMatch(/wayfinder may not edit/);
    expect(personaWall(cwd, "wayfinder", "main.py")).toMatch(/wayfinder may not edit/);
    expect(personaWall(cwd, "architect", "src/foo.ts")).toMatch(/architect may not land/);
    expect(personaWall(cwd, "architect", "docs/adr/001.md")).toBe("");
    expect(personaWall(cwd, "implementer", "src/foo.ts")).toBe("");
    expect(personaWall(cwd, "research", "SPEC.md")).toBe("");
    expect(personaWall(cwd, "research", "main.py")).toMatch(/research may not edit/);
  });

  test("isProtectedPath still blocks .env", () => {
    expect(isProtectedPath(cwd, ".env")).toBe(true);
    expect(personaWall(cwd, "implementer", ".env")).toMatch(/Protected path/);
  });
});

describe("protected / beads / sidecar walls", () => {
  test("isProtectedPath blocks env files and credential material", () => {
    expect(isProtectedPath(cwd, ".env")).toBe(true);
    expect(isProtectedPath(cwd, "src/.env.local")).toBe(true);
    expect(isProtectedPath(cwd, ".env.production")).toBe(true);
    expect(isProtectedPath(cwd, ".git/config")).toBe(true);
    expect(isProtectedPath(cwd, "node_modules/pkg/index.js")).toBe(true);
    expect(isProtectedPath(cwd, "secrets/keys/id_rsa")).toBe(true);
    expect(isProtectedPath(cwd, "certs/server.pem")).toBe(true);
    expect(isProtectedPath(cwd, "config/credentials.json")).toBe(true);
    expect(isProtectedPath(cwd, "config/secrets.json")).toBe(true);
    expect(isProtectedPath(cwd, "src/app.ts")).toBe(false);
    expect(isProtectedPath(cwd, "README.md")).toBe(false);
  });

  test("isBeadsPath allows harness beadfinder dirs and .beads/", () => {
    expect(isBeadsPath(cwd, ".beads/issues.jsonl")).toBe(true);
    expect(isBeadsPath(cwd, ".beads")).toBe(true);
    expect(isBeadsPath(cwd, ".omp/beadfinder/state.json")).toBe(true);
    expect(isBeadsPath(cwd, ".omp/beadfinder-debug.log")).toBe(true);
    expect(isBeadsPath(cwd, "beads/issues.jsonl")).toBe(false);
    expect(isBeadsPath(cwd, ".omp/other/state.json")).toBe(false);
  });

  test("isBareBeadsPath flags the dot-less beads/ directory only", () => {
    expect(isBareBeadsPath(cwd, "beads")).toBe(true);
    expect(isBareBeadsPath(cwd, "beads/issues.jsonl")).toBe(true);
    expect(isBareBeadsPath(cwd, "./beads/")).toBe(true);
    expect(isBareBeadsPath(cwd, ".beads/issues.jsonl")).toBe(false);
    expect(isBareBeadsPath(cwd, "src/beads-helper.ts")).toBe(false);
    expect(isBareBeadsPath(cwd, "")).toBe(false);
  });

  test("isTrackerSidecar matches markdown trackers and github issues", () => {
    expect(isTrackerSidecar(cwd, "TODO.md")).toBe(true);
    expect(isTrackerSidecar(cwd, "todos.md")).toBe(true);
    expect(isTrackerSidecar(cwd, "ISSUES.md")).toBe(true);
    expect(isTrackerSidecar(cwd, "git-issues.md")).toBe(true);
    expect(isTrackerSidecar(cwd, "docs/TODO.md")).toBe(true);
    expect(isTrackerSidecar(cwd, ".github/issues/12.md")).toBe(true);
    expect(isTrackerSidecar(cwd, ".github/issue_template.md")).toBe(true);
    expect(isTrackerSidecar(cwd, "README.md")).toBe(false);
    expect(isTrackerSidecar(cwd, "src/todo-list.ts")).toBe(false);
  });

  test("isLikelyAdrPath matches ADR directories and files", () => {
    expect(isLikelyAdrPath(cwd, "docs/adr/001-record-decisions.md")).toBe(true);
    expect(isLikelyAdrPath(cwd, "adr/0002.md")).toBe(true);
    expect(isLikelyAdrPath(cwd, "docs/adr-notes.md")).toBe(true);
    expect(isLikelyAdrPath(cwd, "ADR-index.md")).toBe(true);
    expect(isLikelyAdrPath(cwd, "src/app.ts")).toBe(false);
    expect(isLikelyAdrPath(cwd, "radar/plot.md")).toBe(false);
  });
});
