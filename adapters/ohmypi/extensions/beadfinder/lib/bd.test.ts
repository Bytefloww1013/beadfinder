import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  asIssues,
  formatSnapshot,
  isAppendDecision,
  isClaimNext,
  isClosedStatus,
  isSessionBoot,
  issueId,
  labelsOf,
  modeFromLabels,
  parseClaimNextArgs,
  personaFromArg,
  personaFromRoleLabel,
  listLive,
  rememberScriptContext,
  runBd,
  type BdIssue,
} from "./bd.ts";
import { statePath } from "./fsutil.ts";
import { loadState } from "./state.ts";

describe("OMP persona vocabulary", () => {
  test("role labels route to personas, aliases included", () => {
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

  test("script persona args accept canonical names and fall back to role labels", () => {
    expect(personaFromArg("research")).toBe("research");
    expect(personaFromArg("implementer")).toBe("implementer");
    expect(personaFromArg("implementation")).toBe("implementer");
    expect(personaFromArg("")).toBe("");
    expect(personaFromArg("bogus")).toBe("");
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

describe("runBd / listLive against a fake bd on PATH", () => {
  test("runBd parses JSON output", async () => {
    await withFakeBd(["#!/bin/sh", "echo '[{\"id\":\"a-1\"}]'", "exit 0"], async (bin) => {
      const res = await runBd(bin, ["list", "--status", "open"]);
      expect(res.ok).toBe(true);
      expect(res.json).toEqual([{ id: "a-1" }]);
    });
  });

  test("listLive issues one combined open,in_progress query by default", async () => {
    await withFakeBd(
      [
        "#!/bin/sh",
        "echo '[{\"id\":\"a-1\",\"status\":\"open\"},{\"id\":\"b-2\",\"status\":\"in_progress\"},{\"id\":\"c-3\",\"status\":\"closed\"}]'",
        "exit 0",
      ],
      async (bin) => {
        const issues = await listLive(bin, ["list"]);
        expect(issues.map(issueId)).toEqual(["a-1", "b-2"]);
      },
    );
  });
});

describe("OMP rememberScriptContext session threading", () => {
  test("persists script context into the given session bucket only", () => {
    const dir = mkdtempSync(join(tmpdir(), "beadfinder-omp-rsc-"));
    try {
      rememberScriptContext(dir, "ses_a", "session-boot.sh --persona implementer --parent beads-p.1");
      const a = loadState(dir, "ses_a");
      expect(a.persona).toBe("implementer");
      expect(a.parent).toBe("beads-p.1");
      // a different session bucket is untouched
      const b = loadState(dir, "ses_b");
      expect(b.persona).toBe("unknown");
      expect(b.parent).toBe("");
      // claim bookkeeping lands in the owning session's bucket
      const before = loadState(dir, "ses_a").claimsThisSession;
      rememberScriptContext(dir, "ses_a", "bd update beads-p.1 --claim");
      const after = loadState(dir, "ses_a");
      expect(after.claimedId).toBe("beads-p.1");
      expect(after.claimsThisSession).toBe(before + 1);
      // on-disk store has real session keys — no silent "[object Object]" no-op
      // writes; loadState of a never-saved bucket does not persist an empty one
      const raw = JSON.parse(readFileSync(statePath(dir), "utf8"));
      expect(Object.keys(raw.sessions)).toEqual(["ses_a"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
