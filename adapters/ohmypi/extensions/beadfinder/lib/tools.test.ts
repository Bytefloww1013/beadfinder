import { describe, expect, test } from "bun:test";
import {
  applyPatchPaths,
  bashCommand,
  firstBdInvocation,
  flagValue,
  globSearchPaths,
  hasFlag,
  inputPath,
  isBashTool,
  isGlobTool,
  isReadTool,
  isSpawnTool,
  isWriteTool,
  labelBlob,
  looksLikeProductWriteBash,
  spawnText,
  toolName,
} from "./tools.ts";

describe("OMP tool classification", () => {
  test("toolName lowercases and defaults to empty string", () => {
    expect(toolName({ toolName: "BaSh" })).toBe("bash");
    expect(toolName({})).toBe("");
    expect(toolName({ toolName: undefined })).toBe("");
  });

  test("write tools are write/edit/multiedit (apply_patch is NOT in the set)", () => {
    expect(isWriteTool("write")).toBe(true);
    expect(isWriteTool("edit")).toBe(true);
    expect(isWriteTool("multiedit")).toBe(true);
    expect(isWriteTool("apply_patch")).toBe(false);
    expect(isWriteTool("read")).toBe(false);
  });

  test("read tools", () => {
    expect(isReadTool("read")).toBe(true);
    expect(isReadTool("edit")).toBe(false);
  });

  test("bash tools are bash/shell", () => {
    expect(isBashTool("bash")).toBe(true);
    expect(isBashTool("shell")).toBe(true);
    expect(isBashTool("execute_command")).toBe(false);
  });

  test("spawn tools: exact set or any name containing 'task'", () => {
    expect(isSpawnTool("task")).toBe(true);
    expect(isSpawnTool("spawn")).toBe(true);
    expect(isSpawnTool("subagent")).toBe(true);
    expect(isSpawnTool("agent")).toBe(true);
    expect(isSpawnTool("my_task_runner")).toBe(true);
    expect(isSpawnTool("spawn_agent")).toBe(false);
    expect(isSpawnTool("start_subagent")).toBe(false);
  });

  test("glob tools: exact set or any name containing 'glob'", () => {
    expect(isGlobTool("glob")).toBe(true);
    expect(isGlobTool("grep")).toBe(true);
    expect(isGlobTool("search")).toBe(true);
    expect(isGlobTool("list_dir")).toBe(true);
    expect(isGlobTool("ls")).toBe(true);
    expect(isGlobTool("glob_files")).toBe(true);
    expect(isGlobTool("search_codebase")).toBe(false);
    expect(isGlobTool("read")).toBe(false);
  });
});

describe("input path extraction", () => {
  test("inputPath checks the known path keys in order", () => {
    expect(inputPath({ path: "src/a.ts" })).toBe("src/a.ts");
    expect(inputPath({ filePath: "src/b.ts" })).toBe("src/b.ts");
    expect(inputPath({ file_path: "src/c.ts" })).toBe("src/c.ts");
    expect(inputPath({ filename: "src/d.ts" })).toBe("src/d.ts");
    expect(inputPath({ target_directory: "src/e" })).toBe("src/e");
    expect(inputPath({ targetDirectory: "src/f" })).toBe("src/f");
    expect(inputPath({ file: "ignored" })).toBe("");
    expect(inputPath({})).toBe("");
    expect(inputPath({ path: "" })).toBe("");
  });

  test("earlier path keys win", () => {
    expect(inputPath({ path: "first.ts", filePath: "second.ts" })).toBe("first.ts");
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

  test("falls back to unified-diff headers when no markers are present, deduped", () => {
    const patch = [
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1 +1 @@",
      "-const x = 1",
      "+const x = 2",
    ].join("\n");
    expect(applyPatchPaths(patch)).toEqual(["src/foo.ts"]);
  });

  test("markers take precedence over diff headers", () => {
    const patch = [
      "*** Update File: src/marker.ts",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
    ].join("\n");
    expect(applyPatchPaths(patch)).toEqual(["src/marker.ts"]);
  });

  test("empty input yields no paths", () => {
    expect(applyPatchPaths("")).toEqual([]);
    expect(applyPatchPaths("no paths here")).toEqual([]);
  });
});

describe("glob search paths", () => {
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

describe("bash + spawn text extraction", () => {
  test("bashCommand reads command, then cmd, then script", () => {
    expect(bashCommand({ command: "ls -la" })).toBe("ls -la");
    expect(bashCommand({ cmd: "echo hi" })).toBe("echo hi");
    expect(bashCommand({ script: "echo yo" })).toBe("echo yo");
    expect(bashCommand({ command: 42 })).toBe("");
    expect(bashCommand({})).toBe("");
  });

  test("spawnText walks nested strings and arrays", () => {
    expect(spawnText({ prompt: "Ticket auth-1" })).toBe("Ticket auth-1");
    expect(spawnText({ a: "one", b: { c: ["two", "three"] } })).toBe("one\ntwo\nthree");
    expect(spawnText({})).toBe("");
  });
});

describe("product write detection via bash", () => {
  test("flags mutating commands aimed at product directories", () => {
    expect(looksLikeProductWriteBash("sed -i 's/a/b/' src/main.ts")).toBe(true);
    expect(looksLikeProductWriteBash("cat src/tpl.txt > lib/config.ts")).toBe(true);
    expect(looksLikeProductWriteBash("printf 'y' > packages/gen/index.ts")).toBe(true);
    expect(looksLikeProductWriteBash("python3 script.py > apps/web/data.json")).toBe(true);
  });

  test("does not flag reads or non-product targets", () => {
    expect(looksLikeProductWriteBash("bd show auth-1 --json")).toBe(false);
    expect(looksLikeProductWriteBash("cat README.md")).toBe(false);
    expect(looksLikeProductWriteBash("echo x > notes/scratch.txt")).toBe(true);
    // rm without a redirect/write indicator is not treated as a write here
    expect(looksLikeProductWriteBash("rm -rf packages/old")).toBe(false);
  });
});

describe("bd argv parsing", () => {
  test("firstBdInvocation finds the bd line and drops the binary prefix", () => {
    const argv = firstBdInvocation("cd src && bd create 'x' --label phase:execute --parent slice-1");
    expect(argv?.[0]).toBe("bd");
    expect(argv?.[1]).toBe("create");
    expect(argv).toContain("x");
    expect(hasFlag(argv || [], "--parent")).toBe(true);
  });

  test("firstBdInvocation resolves absolute binary paths", () => {
    const argv = firstBdInvocation("/usr/local/bin/bd list --json");
    expect(argv?.[0]).toBe("/usr/local/bin/bd");
    expect(argv?.[1]).toBe("list");
  });

  test("firstBdInvocation splits on newlines, ;, &&, and || but not single pipes", () => {
    expect(firstBdInvocation("bd list\necho done")?.[1]).toBe("list");
    expect(firstBdInvocation("echo hi; bd show b-1")?.[1]).toBe("show");
    expect(firstBdInvocation("echo hi && bd list")?.[1]).toBe("list");
    expect(firstBdInvocation("echo hi || bd list")?.[1]).toBe("list");
    expect(firstBdInvocation("bd list | grep auth")).toEqual(["bd", "list"]);
  });

  test("firstBdInvocation strips a leading redirect prefix", () => {
    expect(firstBdInvocation("2> /dev/null bd list")?.[1]).toBe("list");
  });

  test("firstBdInvocation returns null when bd is absent", () => {
    expect(firstBdInvocation("echo hello && git status")).toBeNull();
    expect(firstBdInvocation("")).toBeNull();
  });

  test("flagValue reads space-separated and = forms", () => {
    expect(flagValue(["bd", "create", "--parent", "slice-1"], "--parent")).toBe("slice-1");
    expect(flagValue(["bd", "create", "--parent=slice-2"], "--parent")).toBe("slice-2");
    expect(flagValue(["bd", "create"], "--parent")).toBe("");
    expect(flagValue(["bd", "create", "--parent"], "--parent")).toBe("");
    expect(flagValue(["bd"], "--nope")).toBe("");
  });

  test("hasFlag matches both flag forms", () => {
    expect(hasFlag(["bd", "--claim"], "--claim")).toBe(true);
    expect(hasFlag(["bd", "--claim=yes"], "--claim")).toBe(true);
    expect(hasFlag(["bd"], "--claim")).toBe(false);
  });

  test("labelBlob collects -l, --label, and --label= values", () => {
    expect(labelBlob(["bd", "create", "x", "-l", "a", "--label", "b", "--label=c"])).toBe("a,b,c");
    expect(labelBlob(["bd", "list"])).toBe("");
    expect(labelBlob(["bd", "-l"])).toBe("");
  });
});

describe("adversarial argv parsing (shared tools-core behavior)", () => {
  test("quoted values survive as single tokens", () => {
    const argv = firstBdInvocation('bd create "fix the bug" --reason "a b c"');
    expect(argv).toContain("fix the bug");
    expect(flagValue(argv || [], "--reason")).toBe("a b c");
  });

  test("flagValue: the LAST occurrence wins for repeated flags", () => {
    expect(flagValue(["bd", "create", "--parent", "one", "--parent", "two"], "--parent")).toBe("two");
    expect(flagValue(["bd", "create", "--parent", "one", "--parent=two"], "--parent")).toBe("two");
  });

  test("bd after &&, ;, ||, and newline is detected", () => {
    expect(firstBdInvocation("echo a && bd list")?.[1]).toBe("list");
    expect(firstBdInvocation("echo a; bd list")?.[1]).toBe("list");
    expect(firstBdInvocation("echo a || bd list")?.[1]).toBe("list");
    expect(firstBdInvocation("echo a\nbd list")?.[1]).toBe("list");
  });

  test("a single | is not a split boundary; bd after a pipe is still detected", () => {
    const argv = firstBdInvocation("echo hi | bd list");
    expect(argv).toEqual(["bd", "list"]);
    expect(firstBdInvocation("bd list | grep auth")).toEqual(["bd", "list"]);
  });

  test("leading redirects are stripped before tokenizing", () => {
    expect(firstBdInvocation("2> /dev/null bd list")).toEqual(["bd", "list"]);
    expect(firstBdInvocation("> out.txt bd list")).toEqual(["bd", "list"]);
  });

  test("bashCommand joins commands arrays with && (unified cline superset)", () => {
    expect(bashCommand({ commands: ["echo 1", "echo 2"] })).toBe("echo 1 && echo 2");
  });
});
