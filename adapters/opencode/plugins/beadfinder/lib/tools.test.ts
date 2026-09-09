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
  bashCommand,
  flagValue,
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

  test("falls back to unified-diff headers when no markers are present", () => {
    const patch = [
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1 +1 @@",
      "-const x = 1",
      "+const x = 2",
    ].join("\n");
    expect(toolPaths("apply_patch", { patchText: patch })).toEqual(["src/foo.ts"]);
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

describe("adversarial tokenizer coverage (tools-core)", () => {
  test("flagValue reads the --flag=value form", () => {
    expect(flagValue(["bd", "create", "--parent=slice-9"], "--parent")).toBe("slice-9");
    expect(flagValue(["bd", "create", "--label=x:y"], "--label")).toBe("x:y");
    expect(flagValue(["bd", "create", "--parent="], "--parent")).toBe("");
  });

  test("tokenize keeps quoted values as single tokens", () => {
    const argv = firstBdInvocation('bd create "fix the bug" --reason "a b c"');
    expect(argv).not.toBeNull();
    expect(argv).toContain("fix the bug");
    expect(flagValue(argv || [], "--reason")).toBe("a b c");
    const single = firstBdInvocation("bd create 'one two' --reason 'x y'");
    expect(single).toContain("one two");
    expect(flagValue(single || [], "--reason")).toBe("x y");
  });

  test("flagValue: the LAST occurrence wins for repeated flags", () => {
    expect(flagValue(["bd", "create", "--parent", "one", "--parent", "two"], "--parent")).toBe("two");
    expect(flagValue(["bd", "create", "--parent=one", "--parent", "two"], "--parent")).toBe("two");
    expect(flagValue(["bd", "create", "--parent", "one", "--parent=two"], "--parent")).toBe("two");
  });

  test("hasFlag/flagValue still match flags placed after a -- separator (documented limitation)", () => {
    expect(hasFlag(["bd", "create", "x", "--", "--claim"], "--claim")).toBe(true);
    expect(flagValue(["bd", "create", "x", "--", "--parent", "p"], "--parent")).toBe("p");
  });

  test("firstBdInvocation finds bd after &&, ;, ||, and newline", () => {
    expect(firstBdInvocation("echo a && bd list")?.[1]).toBe("list");
    expect(firstBdInvocation("echo a; bd list")?.[1]).toBe("list");
    expect(firstBdInvocation("echo a || bd list")?.[1]).toBe("list");
    expect(firstBdInvocation("echo a\nbd list")?.[1]).toBe("list");
  });

  test("a single | is not a split boundary; argv truncates at the pipe", () => {
    expect(firstBdInvocation("bd list | grep auth")).toEqual(["bd", "list"]);
    expect(firstBdInvocation("echo hi | bd list")).toEqual(["bd", "list"]);
  });

  test("leading redirects are stripped before tokenizing", () => {
    expect(firstBdInvocation("2> /dev/null bd list")).toEqual(["bd", "list"]);
    expect(firstBdInvocation("> out.txt bd list")).toEqual(["bd", "list"]);
  });

  test("bashCommand joins commands arrays with && (unified cline superset)", () => {
    expect(bashCommand({ commands: ["echo 1", "echo 2"] })).toBe("echo 1 && echo 2");
    expect(bashCommand({ commands: ["echo 1", 42, "echo 2"] })).toBe("echo 1 && echo 2");
  });
});
