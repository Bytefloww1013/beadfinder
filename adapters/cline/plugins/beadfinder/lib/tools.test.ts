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
  isReadTool,
  isGlobTool,
  labelBlob,
  looksLikeProductWriteBash,
  spawnContract,
  toolPaths,
  bashCommand,
} from "./tools.ts";
import { isBareBeadsPath, isProductPath, isProtectedPath, isTrackerSidecar, personaWall } from "./paths.ts";

const cwd = "/tmp/beadfinder-cline-test-repo";

describe("Cline tool classification", () => {
  test("treats apply_patch, editor, write, edit as write tools", () => {
    expect(isWriteTool("apply_patch")).toBe(true);
    expect(isWriteTool("editor")).toBe(true);
    expect(isWriteTool("write")).toBe(true);
    expect(isWriteTool("edit")).toBe(true);
    expect(isWriteTool("read")).toBe(false);
  });

  test("treats execute_command and run_commands as bash tools", () => {
    expect(isBashTool("execute_command")).toBe(true);
    expect(isBashTool("run_commands")).toBe(true);
    expect(isBashTool("bash")).toBe(true);
  });

  test("treats read_files and read as read tools", () => {
    expect(isReadTool("read_files")).toBe(true);
    expect(isReadTool("read")).toBe(true);
    expect(isReadTool("editor")).toBe(false);
  });

  test("treats spawn_agent and subagent tools as spawn tools", () => {
    expect(isSpawnTool("spawn_agent")).toBe(true);
    expect(isSpawnTool("start_subagent")).toBe(true);
    expect(isSpawnTool("subagent_run")).toBe(true);
    expect(isSpawnTool("task")).toBe(true);
  });

  test("treats search_codebase as glob/search tool", () => {
    expect(isGlobTool("search_codebase")).toBe(true);
    expect(isGlobTool("glob")).toBe(true);
  });


describe("Cline apply_patch & path extraction", () => {
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

  test("extracts standard diff headers when patch markers absent", () => {
    const diff = [
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1,3 +1,4 @@",
    ].join("\n");
    expect(applyPatchPaths(diff)).toEqual(["src/app.ts"]);
  });

  test("toolPaths uses patchText or patch for apply_patch", () => {
    expect(toolPaths("apply_patch", { patchText: "*** Update File: src/foo.ts\n" })).toEqual(["src/foo.ts"]);
    expect(toolPaths("apply_patch", { patch: "*** Update File: src/bar.ts\n" })).toEqual(["src/bar.ts"]);
    expect(toolPaths("editor", { path: "src/main.ts" })).toEqual(["src/main.ts"]);
    expect(toolPaths("read_files", { files: [{ path: "src/index.ts" }] })).toEqual(["src/index.ts"]);
  });

  test("bashCommand extracts command strings and commands arrays", () => {
    expect(bashCommand({ command: "ls -la" })).toBe("ls -la");
    expect(bashCommand({ commands: ["echo 1", "echo 2"] })).toBe("echo 1 && echo 2");
  });
});

describe("Cline path walls", () => {
  test("blocks bare beads/ and .env", () => {
    expect(isBareBeadsPath(cwd, "beads")).toBe(true);
    expect(isBareBeadsPath(cwd, "beads/issues.jsonl")).toBe(true);
    expect(isBareBeadsPath(cwd, ".beads/issues.jsonl")).toBe(false);
    expect(isBareBeadsPath(cwd, ".cline/beadfinder/state.json")).toBe(false);
    expect(isProtectedPath(cwd, ".env")).toBe(true);
    expect(isProtectedPath(cwd, "src/.env.local")).toBe(true);
    expect(isTrackerSidecar(cwd, "TODO.md")).toBe(true);
    expect(isProductPath(cwd, "src/app.ts")).toBe(true);
    expect(isProductPath(cwd, ".cline/plugins/beadfinder/index.ts")).toBe(false);
  });

  test("personaWall enforces contracts", () => {
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

describe("Cline spawn + bd parsing", () => {
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

  test("skips hidden system agents", () => {
    expect(isSystemAgent("title")).toBe(true);
    expect(isSystemAgent("summary")).toBe(true);
    expect(isSystemAgent("compaction")).toBe(true);
    expect(isSystemAgent("wayfinder")).toBe(false);
  });
});
