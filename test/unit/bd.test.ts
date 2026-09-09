import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractFirstId,
  isAppendDecision,
  listLive,
  liveSnapshot,
  personaFromArg,
  personaFromRoleLabel,
} from "../../core/lib/bd.ts";
import { SNAPSHOT_PREFIX } from "../../core/lib/tools-core.ts";

describe("isAppendDecision", () => {
  test("true only when append-decision.py is invoked as a command", () => {
    expect(
      isAppendDecision("python3 scripts/append-decision.py --epic x --title t --id i --gist g"),
    ).toBe(true);
    expect(isAppendDecision("./scripts/append-decision.py --epic x --title t --id i --gist g")).toBe(
      true,
    );
    expect(isAppendDecision("python3 append-decision.py docs/adr/001.md")).toBe(true);
  });

  test("false for comments, sibling bd, echo, and missing .py", () => {
    expect(isAppendDecision('bd update id -d "Wiped" # append-decision.py')).toBe(false);
    expect(isAppendDecision('python3 scripts/append-decision.py --help && bd update id -d "x"')).toBe(
      false,
    );
    expect(isAppendDecision("echo append-decision.py")).toBe(false);
    expect(isAppendDecision("append-decision")).toBe(false);
  });
});

describe("persona vocabulary", () => {
  test("role labels route to personas, v0.6 aliases included", () => {
    expect(personaFromRoleLabel("architecture")).toBe("architect");
    expect(personaFromRoleLabel("architect")).toBe("architect");
    expect(personaFromRoleLabel("wayfinder")).toBe("wayfinder");
    expect(personaFromRoleLabel("wayfind")).toBe("wayfinder");
    expect(personaFromRoleLabel("research")).toBe("research");
    expect(personaFromRoleLabel("implementation")).toBe("implementer");
    expect(personaFromRoleLabel("review")).toBe("reviewer");
    expect(personaFromRoleLabel("product")).toBe("product");
    expect(personaFromRoleLabel("nonsense")).toBe("");
  });

  test("script persona args", () => {
    expect(personaFromArg("research")).toBe("research");
    expect(personaFromArg("wayfinder")).toBe("wayfinder");
    expect(personaFromArg("architect")).toBe("architect");
    expect(personaFromArg("implementer")).toBe("implementer");
    expect(personaFromArg("implementation")).toBe("implementer");
    expect(personaFromArg("")).toBe("");
    expect(personaFromArg("bogus")).toBe("");
  });
});

describe("extractFirstId", () => {
  test("matches dotted-prefix ids like agent-workflow-change-cny.4", () => {
    expect(extractFirstId("agent-workflow-change-cny.4")).toBe("agent-workflow-change-cny.4");
    expect(extractFirstId("claimed agent-workflow-change-cny.7 in progress")).toBe(
      "agent-workflow-change-cny.7",
    );
  });

  test("still matches plain ids", () => {
    expect(extractFirstId("bd-12")).toBe("bd-12");
    expect(extractFirstId("abc-12.3")).toBe("abc-12.3");
  });

  test("does not match version strings", () => {
    expect(extractFirstId("bump to v0.7 for release")).toBe("");
    expect(extractFirstId("release v1.2.3 notes")).toBe("");
  });

  test("json path wins when output is json", () => {
    const json = JSON.stringify([{ id: "agent-workflow-change-cny.4", title: "x", status: "open" }]);
    expect(extractFirstId(json)).toBe("agent-workflow-change-cny.4");
  });
});

function withFakeBd(scriptLines: string[], fn: (bin: string) => Promise<void>): Promise<void> {
  const bin = mkdtempSync(join(tmpdir(), "bd-fake-"));
  writeFileSync(join(bin, "bd"), scriptLines.join("\n"));
  chmodSync(join(bin, "bd"), 0o755);
  const oldPath = process.env.PATH;
  process.env.PATH = `${bin}:${oldPath ?? ""}`;
  return fn(bin).finally(() => {
    process.env.PATH = oldPath;
    rmSync(bin, { recursive: true, force: true });
  });
}

describe("listLive per-status fallback", () => {
  test("recovers the union when combined AND per-status calls exit nonzero", async () => {
    await withFakeBd(
      [
        "#!/bin/sh",
        'for a in "$@"; do',
        '  if [ "$a" = "open,in_progress" ]; then exit 2; fi',
        "done",
        'status=""',
        'prev=""',
        'for a in "$@"; do',
        '  if [ "$prev" = "--status" ]; then status="$a"; fi',
        '  prev="$a"',
        "done",
        'if [ "$status" = "open" ]; then',
        "  echo '[{\"id\":\"a-1\",\"status\":\"open\"}]'",
        "  exit 2",
        "fi",
        'if [ "$status" = "in_progress" ]; then',
        "  echo '[{\"id\":\"a-1\",\"status\":\"in_progress\"},{\"id\":\"b-2\",\"status\":\"in_progress\"}]'",
        "  exit 2",
        "fi",
        "exit 3",
      ],
      async (bin) => {
        const issues = await listLive(bin, ["list"]);
        expect(issues.map((i) => i.id).sort()).toEqual(["a-1", "b-2"]);
      },
    );
  });
});

describe("liveSnapshot", () => {
  test("issues the four queries concurrently (order not asserted)", async () => {
    await withFakeBd(
      [
        "#!/bin/sh",
        'log="$(dirname "$0")/calls.log"',
        '{',
        '  printf "%s" "$1"',
        '  shift',
        '  for a in "$@"; do printf "\\t%s" "$a"; done',
        '  printf "\\n"',
        '} >> "$log"',
        "echo '[]'",
        "exit 0",
      ],
      async (bin) => {
        const snap = await liveSnapshot(bin);
        const lines = readFileSync(join(bin, "calls.log"), "utf8")
          .trim()
          .split("\n")
          .filter(Boolean);
        expect(lines).toHaveLength(4);
        const has = (pred: (line: string) => boolean) => lines.some(pred);
        expect(
          has((l) => l.includes("beadfinder:destination") && l.includes("epic")),
        ).toBe(true);
        expect(
          has((l) => l.includes("beadfinder:slice") && !l.includes("destination")),
        ).toBe(true);
        expect(
          has(
            (l) =>
              l.includes("in_progress") &&
              !l.includes("open,in_progress") &&
              !l.includes("beadfinder:"),
          ),
        ).toBe(true);
        expect(has((l) => l.startsWith("ready\t") && l.includes("20"))).toBe(true);
        expect(snap.startsWith(SNAPSHOT_PREFIX)).toBe(true);
        expect(snap).toContain("Live destinations (open + in_progress)");
        expect(snap).toContain("Live slices (open + in_progress)");
        expect(snap).toContain("In progress");
        expect(snap).toContain("Ready work (bd ready)");
      },
    );
  });
});
