import { describe, expect, test } from "bun:test";
import {
  globSearchPaths,
  inputPath,
  isBashTool,
  isGlobTool,
  isReadTool,
  isSpawnTool,
  isWriteTool,
  toolName,
  toolPaths,
} from "../../adapters/ohmypi/extensions/beadfinder/lib/tools.ts";

describe("OMP tool classification", () => {
  test("toolName lowercases and defaults to empty string", () => {
    expect(toolName({ toolName: "BaSh" })).toBe("bash");
    expect(toolName({})).toBe("");
    expect(toolName({ toolName: undefined })).toBe("");
  });

  test("write tools include write/edit/multiedit/apply_patch", () => {
    expect(isWriteTool("write")).toBe(true);
    expect(isWriteTool("edit")).toBe(true);
    expect(isWriteTool("multiedit")).toBe(true);
    expect(isWriteTool("apply_patch")).toBe(true);
    expect(isWriteTool("read")).toBe(false);
  });

  test("read tools", () => {
    expect(isReadTool("read")).toBe(true);
    expect(isReadTool("edit")).toBe(false);
  });

  test("bash tools include bash, shell, and execute_command", () => {
    expect(isBashTool("bash")).toBe(true);
    expect(isBashTool("shell")).toBe(true);
    expect(isBashTool("execute_command")).toBe(true);
  });

  test("spawn tools: exact set, subagent prefixes, or any name containing 'task'", () => {
    expect(isSpawnTool("task")).toBe(true);
    expect(isSpawnTool("spawn")).toBe(true);
    expect(isSpawnTool("subagent")).toBe(true);
    expect(isSpawnTool("agent")).toBe(true);
    expect(isSpawnTool("my_task_runner")).toBe(true);
    expect(isSpawnTool("spawn_agent")).toBe(true);
    expect(isSpawnTool("start_subagent")).toBe(true);
  });

  test("glob tools: exact set or any name containing 'glob'", () => {
    expect(isGlobTool("glob")).toBe(true);
    expect(isGlobTool("grep")).toBe(true);
    expect(isGlobTool("search")).toBe(true);
    expect(isGlobTool("list_dir")).toBe(true);
    expect(isGlobTool("ls")).toBe(true);
    expect(isGlobTool("glob_files")).toBe(true);
    expect(isGlobTool("search_codebase")).toBe(true);
    expect(isGlobTool("read")).toBe(false);
  });
});

describe("OMP input path extraction", () => {
  test("inputPath checks the known path keys in order", () => {
    expect(inputPath({ path: "src/a.ts" })).toBe("src/a.ts");
    expect(inputPath({ filePath: "src/b.ts" })).toBe("src/b.ts");
    expect(inputPath({ file_path: "src/c.ts" })).toBe("src/c.ts");
    expect(inputPath({ filename: "src/d.ts" })).toBe("src/d.ts");
    expect(inputPath({ file: "src/f.ts" })).toBe("src/f.ts");
    expect(inputPath({ target_directory: "src/e" })).toBe("src/e");
    expect(inputPath({ targetDirectory: "src/f" })).toBe("src/f");
    expect(inputPath({})).toBe("");
    expect(inputPath({ path: "" })).toBe("");
  });

  test("earlier path keys win", () => {
    expect(inputPath({ path: "first.ts", filePath: "second.ts" })).toBe("first.ts");
  });
});

describe("OMP glob search paths", () => {
  test("keeps the input path and only beads-prefixed search patterns", () => {
    expect(globSearchPaths({ path: "src", pattern: "src/**/*.ts" })).toEqual(["src"]);
    expect(globSearchPaths({ pattern: "beads/*.jsonl" })).toEqual(["beads/*.jsonl"]);
    expect(globSearchPaths({ pattern: "./beads/issues.jsonl" })).toEqual(["./beads/issues.jsonl"]);
    expect(globSearchPaths({ glob: "beads" })).toEqual(["beads"]);
    expect(globSearchPaths({ glob_pattern: "beads/x.md" })).toEqual(["beads/x.md"]);
  });

  test("dedupes an exact path/pattern repeat", () => {
    expect(globSearchPaths({ path: "beads", pattern: "beads" })).toEqual(["beads"]);
    expect(globSearchPaths({ path: "beads", pattern: "beads/*" })).toEqual(["beads", "beads/*"]);
  });

  test("non-beads patterns are ignored entirely", () => {
    expect(globSearchPaths({ pattern: "**/*" })).toEqual([]);
    expect(globSearchPaths({})).toEqual([]);
  });
});

describe("OMP path extraction", () => {
  test("toolPaths uses canonical extraction", () => {
    expect(toolPaths("apply_patch", { patchText: "*** Update File: src/foo.ts\n" })).toEqual(["src/foo.ts"]);
    expect(toolPaths("apply_patch", { patch: "*** Update File: src/bar.ts\n" })).toEqual(["src/bar.ts"]);
    expect(toolPaths("write", { filePath: "src/bar.ts" })).toEqual(["src/bar.ts"]);
  });
});
