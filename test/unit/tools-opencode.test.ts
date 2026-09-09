import { describe, expect, test } from "bun:test";
import {
  isBashTool,
  isSpawnTool,
  isWriteTool,
  toolPaths,
} from "../../adapters/opencode/plugins/beadfinder/lib/tools.ts";

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
});

describe("OpenCode path extraction", () => {
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
