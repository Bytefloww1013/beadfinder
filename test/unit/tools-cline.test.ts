import { describe, expect, test } from "bun:test";
import {
  bashCommand,
  isBashTool,
  isGlobTool,
  isReadTool,
  isSpawnTool,
  isWriteTool,
  toolPaths,
} from "../../adapters/cline/plugins/beadfinder/lib/tools.ts";

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
});

describe("Cline path extraction", () => {
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
