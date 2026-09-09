import { describe, expect, test } from "bun:test";
import {
  allBdInvocations,
  firstBdInvocation,
  looksLikeProductWriteBash,
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
