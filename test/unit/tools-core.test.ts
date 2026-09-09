import { describe, expect, test } from "bun:test";
import {
  allBdInvocations,
  applyPatchPaths,
  bashCommand,
  firstBdInvocation,
  flagValue,
  hasFlag,
  hitlInText,
  isSystemAgent,
  labelBlob,
  looksLikeProductWriteBash,
  spawnContract,
  spawnText,
  stripShellComments,
} from "../../core/lib/tools-core.ts";

describe("stripShellComments", () => {
  test("leaves quoted hashes intact", () => {
    expect(stripShellComments('bd update -d "foo # bar"')).toBe('bd update -d "foo # bar"');
    expect(stripShellComments("bd update -d 'foo # bar'")).toBe("bd update -d 'foo # bar'");
  });

  test("strips trailing unquoted comments", () => {
    expect(stripShellComments("bd list # trailing comment")).toBe("bd list ");
    expect(stripShellComments('bd update id -d "Wiped" # append-decision.py')).toBe(
      'bd update id -d "Wiped" ',
    );
  });

  test("keeps a quoted hash when a real comment follows", () => {
    expect(stripShellComments('bd update -d "foo # bar" # real')).toBe('bd update -d "foo # bar" ');
  });

  test("preserves backslash-escaped hashes outside quotes", () => {
    expect(stripShellComments("echo foo\\#bar")).toBe("echo foo\\#bar");
  });

  test("strips comments per line, not across newlines", () => {
    expect(stripShellComments("bd list # a\nbd show x # b")).toBe("bd list \nbd show x ");
  });
});

describe("allBdInvocations", () => {
  test("finds BOTH bd calls in a compound command", () => {
    expect(allBdInvocations("bd show valid-id && bd close forbidden-id --reason x")).toEqual([
      ["bd", "show", "valid-id"],
      ["bd", "close", "forbidden-id", "--reason", "x"],
    ]);
  });

  test("finds bd after a pipe", () => {
    expect(allBdInvocations("echo ok | bd close forbidden-id")).toEqual([
      ["bd", "close", "forbidden-id"],
    ]);
  });

  test("does not split 2>&1", () => {
    expect(allBdInvocations("echo ok 2>&1 && bd close forbidden-id")).toEqual([
      ["bd", "close", "forbidden-id"],
    ]);
    expect(allBdInvocations("bd list 2>&1")).toEqual([["bd", "list", "2>&1"]]);
  });

  test("truncates argv before a trailing pipe", () => {
    expect(allBdInvocations("bd list | jq")).toEqual([["bd", "list"]]);
    expect(allBdInvocations("bd list | grep auth")).toEqual([["bd", "list"]]);
  });

  test("captures bd on both sides of a pipe", () => {
    expect(allBdInvocations("bd show a | bd close b")).toEqual([
      ["bd", "show", "a"],
      ["bd", "close", "b"],
    ]);
  });

  test("does not treat a commented-out bd as an invocation", () => {
    expect(allBdInvocations("echo ok # bd close forbidden-id")).toEqual([]);
  });
});

describe("firstBdInvocation", () => {
  test("finds bd after &&, ;, ||, and newline", () => {
    expect(firstBdInvocation("echo a && bd list")?.[1]).toBe("list");
    expect(firstBdInvocation("echo a; bd list")?.[1]).toBe("list");
    expect(firstBdInvocation("echo a || bd list")?.[1]).toBe("list");
    expect(firstBdInvocation("echo a\nbd list")?.[1]).toBe("list");
  });

  test("strips a leading redirect prefix", () => {
    expect(firstBdInvocation("2> /dev/null bd list")).toEqual(["bd", "list"]);
    expect(firstBdInvocation("> out.txt bd list")).toEqual(["bd", "list"]);
  });

  test("bd after a pipe is still the invocation; argv stops before |", () => {
    expect(firstBdInvocation("echo hi | bd list")).toEqual(["bd", "list"]);
    const piped = firstBdInvocation("bd list | grep auth");
    expect(piped?.[0]).toBe("bd");
    expect(piped).toEqual(["bd", "list"]);
    expect(piped).not.toContain("|");
  });

  test("comment stripping applies", () => {
    expect(firstBdInvocation("bd list # | jq")).toEqual(["bd", "list"]);
  });
});

describe("looksLikeProductWriteBash", () => {
  test("flags mutating commands aimed at product paths", () => {
    expect(looksLikeProductWriteBash("sed -i 's/a/b/' src/main.ts")).toBe(true);
  });

  test("does not flag non-mutating bd reads", () => {
    expect(looksLikeProductWriteBash("bd show auth-1 --json")).toBe(false);
  });

  test("treats root source writes as product (not only src/ prefixes)", () => {
    expect(looksLikeProductWriteBash(`python3 -c 'open("main.py","w")'`)).toBe(true);
    expect(looksLikeProductWriteBash("echo hi > pkg/foo.go")).toBe(true);
  });

  test("does not flag planning-doc destinations", () => {
    expect(looksLikeProductWriteBash("echo x > docs/notes.md")).toBe(false);
    expect(looksLikeProductWriteBash("echo x > README.md")).toBe(false);
    expect(looksLikeProductWriteBash("cat tpl.txt > references/spike.md")).toBe(false);
  });
});

describe("applyPatchPaths", () => {
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

describe("flag / argv helpers", () => {
  test("flagValue reads space-separated and = forms", () => {
    expect(flagValue(["bd", "create", "--parent", "slice-1"], "--parent")).toBe("slice-1");
    expect(flagValue(["bd", "create", "--parent=slice-9"], "--parent")).toBe("slice-9");
    expect(flagValue(["bd", "create", "--label=x:y"], "--label")).toBe("x:y");
    expect(flagValue(["bd", "create", "--parent="], "--parent")).toBe("");
    expect(flagValue(["bd", "create"], "--parent")).toBe("");
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

  test("tokenize keeps quoted values as single tokens", () => {
    const argv = firstBdInvocation('bd create "fix the bug" --reason "a b c"');
    expect(argv).not.toBeNull();
    expect(argv).toContain("fix the bug");
    expect(flagValue(argv || [], "--reason")).toBe("a b c");
    const single = firstBdInvocation("bd create 'one two' --reason 'x y'");
    expect(single).toContain("one two");
    expect(flagValue(single || [], "--reason")).toBe("x y");
  });

  test("labelBlob collects -l, --label, and --label= values", () => {
    expect(labelBlob(["bd", "create", "x", "-l", "a", "--label", "b", "--label=c"])).toBe("a,b,c");
    expect(labelBlob(["bd", "list"])).toBe("");
    expect(labelBlob(["bd", "-l"])).toBe("");
  });
});

describe("bashCommand / spawnText / spawn contract", () => {
  test("bashCommand reads command, then cmd, then script, then commands arrays", () => {
    expect(bashCommand({ command: "ls -la" })).toBe("ls -la");
    expect(bashCommand({ cmd: "echo hi" })).toBe("echo hi");
    expect(bashCommand({ script: "echo yo" })).toBe("echo yo");
    expect(bashCommand({ command: 42 })).toBe("");
    expect(bashCommand({})).toBe("");
    expect(bashCommand({ commands: ["echo 1", "echo 2"] })).toBe("echo 1 && echo 2");
    expect(bashCommand({ commands: ["echo 1", 42, "echo 2"] })).toBe("echo 1 && echo 2");
  });

  test("spawnText walks nested strings and arrays", () => {
    expect(spawnText({ prompt: "Ticket auth-1" })).toBe("Ticket auth-1");
    expect(spawnText({ a: "one", b: { c: ["two", "three"] } })).toBe("one\ntwo\nthree");
    expect(spawnText({})).toBe("");
  });

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

  test("skips hidden system agents", () => {
    expect(isSystemAgent("title")).toBe(true);
    expect(isSystemAgent("summary")).toBe(true);
    expect(isSystemAgent("compaction")).toBe(true);
    expect(isSystemAgent("wayfinder")).toBe(false);
  });
});
