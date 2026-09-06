import { describe, expect, test } from "bun:test";
import {
  isBareBeadsPath,
  isBeadsPath,
  isLikelyAdrPath,
  isProductPath,
  isProtectedPath,
  isTrackerSidecar,
} from "./paths.ts";

const cwd = "/tmp/beadfinder-omp-test-repo";

describe("OMP path walls", () => {
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

  test("isBeadsPath allows .beads/ and .omp/beadfinder/ only", () => {
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

  test("isProductPath matches product prefixes and rejects tracker state", () => {
    expect(isProductPath(cwd, "src/app.ts")).toBe(true);
    expect(isProductPath(cwd, "lib/util.ts")).toBe(true);
    expect(isProductPath(cwd, "apps/web/page.tsx")).toBe(true);
    expect(isProductPath(cwd, "packages/core/index.ts")).toBe(true);
    expect(isProductPath(cwd, "backend/handler.go")).toBe(true);
    expect(isProductPath(cwd, "frontend/App.tsx")).toBe(true);
    expect(isProductPath(cwd, "server/main.py")).toBe(true);
    expect(isProductPath(cwd, "client/api.ts")).toBe(true);
    expect(isProductPath(cwd, "cmd/root.go")).toBe(true);
    expect(isProductPath(cwd, "internal/auth/auth.go")).toBe(true);
    expect(isProductPath(cwd, ".omp/extensions/beadfinder/index.ts")).toBe(false);
    expect(isProductPath(cwd, ".beads/issues.jsonl")).toBe(false);
    expect(isProductPath(cwd, ".git/hooks/pre-commit")).toBe(false);
    expect(isProductPath(cwd, "README.md")).toBe(false);
    expect(isProductPath(cwd, "docs/guide.md")).toBe(false);
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
