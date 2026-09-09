import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  asIssues,
  extractFirstId,
  formatSnapshot,
  isAppendDecision,
  isClaimNext,
  isClosedStatus,
  isSessionBoot,
  issueId,
  labelsOf,
  listLive,
  liveSnapshot,
  modeFromLabels,
  parseClaimNextArgs,
  personaFromArg,
  personaFromRoleLabel,
  rememberScriptContext,
  runBd,
  type BdIssue,
} from "../../core/lib/bd.ts";
import { statePath } from "../../core/lib/fsutil.ts";
import { loadState } from "../../core/lib/state.ts";
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

describe("issue helpers", () => {
  test("labelsOf accepts arrays, comma strings, and whitespace strings", () => {
    expect(labelsOf({ labels: ["a", "b"] })).toEqual(["a", "b"]);
    expect(labelsOf({ labels: "a,b" })).toEqual(["a", "b"]);
    expect(labelsOf({ labels: "a b  c" })).toEqual(["a", "b", "c"]);
    expect(labelsOf({ labels: "" })).toEqual([]);
    expect(labelsOf({})).toEqual([]);
    expect(labelsOf({ labels: undefined })).toEqual([]);
  });

  test("issueId stringifies id and defaults to empty", () => {
    expect(issueId({ id: "auth-12" })).toBe("auth-12");
    expect(issueId({})).toBe("");
    expect(issueId({ id: 42 })).toBe("42");
  });

  test("isClosedStatus recognizes closed synonyms and rejects live statuses", () => {
    for (const s of ["closed", "done", "complete", "completed", "Closed", "DONE"]) {
      expect(isClosedStatus(s)).toBe(true);
    }
    for (const s of ["open", "in_progress", "blocked", "", undefined]) {
      expect(isClosedStatus(s)).toBe(false);
    }
  });

  test("asIssues unwraps envelopes, single objects, and rejects junk", () => {
    const a: BdIssue = { id: "a-1", title: "A" };
    const b: BdIssue = { id: "b-2", title: "B" };
    expect(asIssues([a, b])).toEqual([a, b]);
    expect(asIssues({ issues: [a] })).toEqual([a]);
    expect(asIssues({ items: [a] })).toEqual([a]);
    expect(asIssues({ data: [a] })).toEqual([a]);
    expect(asIssues({ issue: a })).toEqual([a]);
    expect(asIssues(a)).toEqual([a]);
    expect(asIssues(null)).toEqual([]);
    expect(asIssues(undefined)).toEqual([]);
    expect(asIssues("nope")).toEqual([]);
    expect(asIssues([null, a, "x"])).toEqual([a]);
  });

  test("modeFromLabels prefers hitl over afk", () => {
    expect(modeFromLabels(["hitl"])).toBe("hitl");
    expect(modeFromLabels(["beadfinder:grill"])).toBe("hitl");
    expect(modeFromLabels(["afk"])).toBe("afk");
    expect(modeFromLabels(["AFK", "extra"])).toBe("afk");
    expect(modeFromLabels(["hitl", "afk"])).toBe("hitl");
    expect(modeFromLabels(["random"])).toBe("");
    expect(modeFromLabels([])).toBe("");
  });
});

describe("script detection + arg parsing", () => {
  test("isClaimNext / isSessionBoot / isAppendDecision match script names", () => {
    expect(isClaimNext("bash .beads/scripts/claim-next.sh --parent slice-1")).toBe(true);
    expect(isClaimNext("./claim-next.sh")).toBe(true);
    expect(isClaimNext("claim-next")).toBe(false);
    expect(isSessionBoot("bash session-boot.sh")).toBe(true);
    expect(isSessionBoot("claim-next.sh")).toBe(false);
    expect(isAppendDecision("python3 append-decision.py docs/adr/001.md")).toBe(true);
    expect(isAppendDecision("append-decision")).toBe(false);
  });

  test("parseClaimNextArgs extracts parent and persona", () => {
    expect(parseClaimNextArgs("claim-next.sh --parent slice-1 --persona research")).toEqual({
      parent: "slice-1",
      persona: "research",
    });
    expect(parseClaimNextArgs("claim-next.sh --persona=implementation")).toEqual({
      parent: "",
      persona: "implementer",
    });
    expect(parseClaimNextArgs("claim-next.sh")).toEqual({ parent: "", persona: "" });
    expect(parseClaimNextArgs("claim-next.sh --persona bogus")).toEqual({
      parent: "",
      persona: "",
    });
  });
});

describe("formatSnapshot", () => {
  test("renders none for empty lists", () => {
    expect(formatSnapshot([], "Frontier")).toBe("Frontier: none");
  });

  test("renders id, status, and title lines", () => {
    const out = formatSnapshot(
      [
        { id: "a-1", status: "open", title: "First" },
        { id: "b-2", status: "in_progress", title: "Second" },
        { id: "c-3", title: "No status" },
      ],
      "Frontier",
    );
    expect(out).toBe(
      "Frontier:\n- a-1 [open] First\n- b-2 [in_progress] Second\n- c-3 [?] No status",
    );
  });

  test("caps output at 12 issues", () => {
    const many: BdIssue[] = Array.from({ length: 20 }, (_, i) => ({
      id: `x-${i}`,
      status: "open",
      title: `T${i}`,
    }));
    const out = formatSnapshot(many, "F");
    expect(out.split("\n")).toHaveLength(13);
    expect(out).toContain("x-11");
    expect(out).not.toContain("x-12");
  });
});

describe("runBd against a fake bd on PATH", () => {
  test("runBd parses JSON output", async () => {
    await withFakeBd(["#!/bin/sh", "echo '[{\"id\":\"a-1\"}]'", "exit 0"], async (bin) => {
      const res = await runBd(bin, ["list", "--status", "open"]);
      expect(res.ok).toBe(true);
      expect(res.json).toEqual([{ id: "a-1" }]);
    });
  });
});

describe("rememberScriptContext session threading", () => {
  test("persists script context into the given session bucket only", () => {
    const dir = mkdtempSync(join(tmpdir(), "beadfinder-rsc-"));
    try {
      rememberScriptContext(dir, "ses_a", "session-boot.sh --persona implementer --parent beads-p.1");
      const a = loadState(dir, "ses_a");
      expect(a.persona).toBe("implementer");
      expect(a.parent).toBe("beads-p.1");
      const b = loadState(dir, "ses_b");
      expect(b.persona).toBe("unknown");
      expect(b.parent).toBe("");
      const before = loadState(dir, "ses_a").claimsThisSession;
      rememberScriptContext(dir, "ses_a", "bd update beads-p.1 --claim");
      const after = loadState(dir, "ses_a");
      expect(after.claimedId).toBe("beads-p.1");
      expect(after.claimsThisSession).toBe(before + 1);
      const raw = JSON.parse(readFileSync(statePath(dir), "utf8"));
      expect(Object.keys(raw.sessions)).toEqual(["ses_a"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
