import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractFirstId, listLive, personaFromArg, personaFromRoleLabel } from "./bd.ts";

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
    expect(personaFromArg("")).toBe("");
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

// listLive spawns the real `bd` binary; put a fake one first on PATH so no
// actual bd is launched.
describe("listLive per-status fallback", () => {
  test("recovers the union when combined AND per-status calls exit nonzero", async () => {
    // Fake bd rejects the combined open,in_progress form and exits nonzero on
    // every call while still printing JSON to stdout. runBd keeps json null on
    // nonzero exit, so the fallback must parse raw output to recover anything.
    // The in_progress bucket repeats a-1 to prove dedupe by issue id.
    const bin = mkdtempSync(join(tmpdir(), "bd-fake-"));
    writeFileSync(
      join(bin, "bd"),
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
      ].join("\n"),
    );
    chmodSync(join(bin, "bd"), 0o755);
    const oldPath = process.env.PATH;
    process.env.PATH = `${bin}:${oldPath ?? ""}`;
    try {
      const issues = await listLive(bin, ["list"]);
      expect(issues.map((i) => i.id).sort()).toEqual(["a-1", "b-2"]);
    } finally {
      process.env.PATH = oldPath;
      rmSync(bin, { recursive: true, force: true });
    }
  });
});
