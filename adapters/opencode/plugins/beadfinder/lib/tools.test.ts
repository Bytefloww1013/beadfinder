import { describe, expect, test } from "bun:test";
import {
  applyPatchPaths,
  firstBdInvocation,
  hasFlag,
  hitlInText,
  isBashTool,
  isSpawnTool,
  isSystemAgent,
  isWriteTool,
  labelBlob,
  looksLikeProductWriteBash,
  spawnContract,
  toolPaths,
} from "./tools.ts";
import { isBareBeadsPath, isProductPath, isProtectedPath, isTrackerSidecar, personaWall } from "./paths.ts";

const cwd = "/tmp/beadfinder-test-repo";

describe("OpenCode tool classification", () => {
  test("treats apply_patch as a write", () => {
    expect(isWriteTool("apply_patch")).toBe(true);
    expect(isWriteTool("edit")).toBe(true);
    expect(isWriteTool("read")).toBe(false);
  });

  test("treats task as a spawn tool", () => {
    expect(isSpawnTool("task")).toBe(true);
    expect(isBashTool("bash")).toBe(true);
  });

  test("skips hidden OpenCode system agents", () => {
    expect(isSystemAgent("title")).toBe(true);
    expect(isSystemAgent("wayfinder")).toBe(false);
  });
});

describe("apply_patch paths", () => {
  test("extracts add/update/delete/move markers", () => {
    const patch = [
      "*** Add File: src/new-file.ts",
      "+export const x = 1",
      "*** Update File: src/existing.ts",
      "*** Delete File: src/obsolete.ts",
      "*** Move to: lib/renamed.ts",
    ].join("\n");
    expect(applyPatchPaths(patch)).toEqual([
      "src/new-file.ts",
      "src/existing.ts",
      "src/obsolete.ts",
      "lib/renamed.ts",
    ]);
  });

  test("toolPaths uses patchText for apply_patch", () => {
    expect(toolPaths("apply_patch", { patchText: "*** Update File: src/foo.ts\n" })).toEqual(["src/foo.ts"]);
    expect(toolPaths("write", { filePath: "src/bar.ts" })).toEqual(["src/bar.ts"]);
  });
});

describe("path walls", () => {
  test("blocks bare beads/ and .env", () => {
    expect(isBareBeadsPath(cwd, "beads")).toBe(true);
    expect(isBareBeadsPath(cwd, "beads/issues.jsonl")).toBe(true);
    expect(isBareBeadsPath(cwd, ".beads/issues.jsonl")).toBe(false);
    expect(isProtectedPath(cwd, ".env")).toBe(true);
    expect(isProtectedPath(cwd, "src/.env.local")).toBe(true);
    expect(isTrackerSidecar(cwd, "TODO.md")).toBe(true);
    expect(isProductPath(cwd, "src/app.ts")).toBe(true);
    expect(isProductPath(cwd, ".opencode/plugins/beadfinder.ts")).toBe(false);
  });

  test("personaWall matches the OMP table", () => {
    expect(personaWall(cwd, "reviewer", "src/foo.ts")).toMatch(/reviewer may not patch/);
    expect(personaWall(cwd, "wayfinder", "src/foo.ts")).toMatch(/wayfinder may not edit/);
    expect(personaWall(cwd, "architect", "src/foo.ts")).toMatch(/architect may not land/);
    expect(personaWall(cwd, "architect", "docs/adr/001.md")).toBe("");
    expect(personaWall(cwd, "implementer", "src/foo.ts")).toBe("");
  });

  test("research is walled like product", () => {
    expect(personaWall(cwd, "research", "src/foo.ts")).toMatch(/research may not edit/);
    expect(personaWall(cwd, "research", "SPEC.md")).toBe("");
    expect(personaWall(cwd, "research", "docs/adr/001.md")).toBe("");
  });
});

describe("spawn + bd parsing", () => {
  test("HITL phrases", () => {
    expect(hitlInText("this is a hitl grill")).toBe(true);
    expect(hitlInText("beadfinder:grill on auth")).toBe(true);
    expect(hitlInText("research the cache")).toBe(false);
  });

  test("spawn contract requires id, one ticket only, claim before work", () => {
    const bad = spawnContract("please implement login");
    expect(bad.ok).toBe(false);
    const good = spawnContract("Ticket auth-12 under slice-1. one ticket only. claim before work.");
    expect(good.ok).toBe(true);
    const dotted = spawnContract(
      "Ticket agent-workflow-change-cny.4 under slice. one ticket only. claim before work.",
    );
    expect(dotted.hasId).toBe(true);
    expect(dotted.ok).toBe(true);
  });

  test("firstBdInvocation + labels", () => {
    const argv = firstBdInvocation("cd src && bd create 'x' --label phase:execute --parent slice-1");
    expect(argv?.[1]).toBe("create");
    expect(labelBlob(argv || [])).toContain("phase:execute");
    expect(hasFlag(argv || [], "--parent")).toBe(true);
  });

  test("product write via bash", () => {
    expect(looksLikeProductWriteBash("sed -i 's/a/b/' src/main.ts")).toBe(true);
    expect(looksLikeProductWriteBash("bd show auth-1 --json")).toBe(false);
  });
});
