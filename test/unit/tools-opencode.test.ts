import { describe, expect, test } from "bun:test";
import {
  isBashTool,
  isGlobTool,
  isReadTool,
  isSpawnTool,
  isWriteTool,
  toolName,
  toolPaths,
} from "../../adapters/opencode/plugins/beadfinder/lib/tools.ts";

describe("OpenCode tool classification", () => {
  test("toolName lowercases and defaults to empty string", () => {
    expect(toolName({ tool: "WRITE" })).toBe("write");
    expect(toolName({ toolName: "BASH" })).toBe("bash");
    expect(toolName({})).toBe("");
  });

  test("treats apply_patch as a write", () => {
    expect(isWriteTool("apply_patch")).toBe(true);
    expect(isWriteTool("edit")).toBe(true);
    expect(isWriteTool("read")).toBe(false);
  });

  test("treats task as a spawn tool", () => {
    expect(isSpawnTool("task")).toBe(true);
    expect(isSpawnTool("spawn_agent")).toBe(true);
    expect(isBashTool("bash")).toBe(true);
  });

  test("treats read and glob tools canonically", () => {
    expect(isReadTool("read")).toBe(true);
    expect(isGlobTool("search")).toBe(true);
  });
});

describe("OpenCode path extraction", () => {
  test("toolPaths uses patchText or patch for apply_patch", () => {
    expect(toolPaths("apply_patch", { patchText: "*** Update File: src/foo.ts\n" })).toEqual(["src/foo.ts"]);
    expect(toolPaths("apply_patch", { patch: "*** Update File: src/baz.ts\n" })).toEqual(["src/baz.ts"]);
    expect(toolPaths("write", { filePath: "src/bar.ts" })).toEqual(["src/bar.ts"]);
  });

  test("toolPaths handles files array", () => {
    expect(toolPaths("read_files", { files: [{ path: "src/one.ts" }, { path: "src/two.ts" }] })).toEqual([
      "src/one.ts",
      "src/two.ts",
    ]);
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
