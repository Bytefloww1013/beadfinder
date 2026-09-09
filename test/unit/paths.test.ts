import { describe, expect, test } from "bun:test";
import { isProductPath, isProtectedPath, personaWall } from "../../core/lib/paths.ts";

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
