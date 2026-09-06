import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

/**
 * runBd/listLive spawn the real `bd` binary via pi.exec. These tests inject a
 * fake exec so no actual process is launched; we assert the argv that would be
 * passed and the result shaping.
 */
type FakeResult = { stdout?: string; stderr?: string; code?: number };
function fakePi(handler: (cmd: string, args: string[]) => FakeResult) {
  const calls: { cmd: string; args: string[]; opts: Record<string, unknown> }[] = [];
  return {
    calls,
    pi: {
      exec: async (cmd: string, args: string[], opts?: Record<string, unknown>) => {
        calls.push({ cmd, args, opts: opts || {} });
        return handler(cmd, args);
      },
    },
  };
}

describe("runBd / listLive against a fake exec", () => {
  test("runBd parses JSON output and records the argv + timeout", async () => {
    const { pi, calls } = fakePi(() => ({ stdout: '[{"id":"a-1"}]', code: 0 }));
    const res = await runBd(pi, ["list", "--status", "open"]);
    expect(res.ok).toBe(true);
    expect(res.json).toEqual([{ id: "a-1" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("bd");
    expect(calls[0].args).toEqual(["list", "--status", "open"]);
    expect(calls[0].opts.timeout).toBe(20_000);
  });

  test("runBd tolerates non-JSON stdout and empty output", async () => {
    let calls = 0;
    const { pi } = fakePi(() => {
      calls += 1;
      return calls === 1 ? { stdout: "created issue bd-7", code: 0 } : { stdout: "", code: 0 };
    });
    const text = await runBd(pi, ["create", "x"]);
    expect(text.ok).toBe(true);
    expect(text.json).toBeNull();
    expect(text.raw).toBe("created issue bd-7");
    const empty = await runBd(pi, ["list"]);
    expect(empty).toEqual({ ok: true, raw: "", json: null });
  });

  test("runBd reports failure on nonzero exit and on exec throw", async () => {
    let calls = 0;
    const { pi } = fakePi(() => {
      calls += 1;
      if (calls === 1) return { stdout: "", stderr: "no bd here", code: 127 };
      throw new Error("spawn failed");
    });
    const failed = await runBd(pi, ["list"]);
    expect(failed.ok).toBe(false);
    expect(failed.json).toBeNull();
    const boom = await runBd(pi, ["list"]);
    expect(boom.ok).toBe(false);
  });

  test("runBd surfaces stderr when stdout is empty", async () => {
    const { pi } = fakePi(() => ({ stdout: "", stderr: "warn: stale", code: 0 }));
    const res = await runBd(pi, ["list"]);
    expect(res.raw).toBe("warn: stale");
  });

  test("listLive issues one combined open,in_progress query by default", async () => {
    const { pi, calls } = fakePi(() => ({
      stdout: JSON.stringify([
        { id: "a-1", status: "open", title: "A" },
        { id: "b-2", status: "in_progress", title: "B" },
        { id: "c-3", status: "closed", title: "C" },
      ]),
      code: 0,
    }));
    const issues = await listLive(pi, ["list"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(["list", "--status", "open,in_progress", "--json"]);
    expect(issues.map(issueId)).toEqual(["a-1", "b-2"]);
  });

  test("listLive falls back to per-status queries when the combined call fails", async () => {
    const { pi, calls } = fakePi((_cmd, args) => {
      if (args.includes("open,in_progress")) return { code: 2, stderr: "unknown flag" };
      if (args.includes("open")) return { stdout: JSON.stringify([{ id: "a-1", status: "open" }]), code: 0 };
      return { stdout: JSON.stringify([{ id: "b-2", status: "in_progress" }]), code: 0 };
    });
    const issues = await listLive(pi, ["list"]);
    expect(calls).toHaveLength(3);
    expect(calls[1].args).toEqual(["list", "--status", "open", "--json"]);
    expect(calls[2].args).toEqual(["list", "--status", "in_progress", "--json"]);
    // The combined call exits nonzero (ok:false), so the per-status fallback
    // runs. Each per-status call exits 0, so both buckets parse normally.
    expect(issues.map(issueId).sort()).toEqual(["a-1", "b-2"]);
  });

  test("listLive recovers the union when the per-status calls also exit nonzero", async () => {
    // Older bd rejects the combined form AND exits nonzero on every call
    // while still printing JSON to stdout. runBd keeps json null on nonzero
    // exit, so the fallback must parse raw to recover anything. The
    // in_progress bucket repeats a-1 to prove dedupe by issue id.
    const { pi, calls } = fakePi((_cmd, args) => {
      if (args.includes("open,in_progress")) return { stdout: "", stderr: "unknown flag", code: 2 };
      if (args.includes("open")) return { stdout: JSON.stringify([{ id: "a-1", status: "open" }]), stderr: "warn: stale index", code: 2 };
      return {
        stdout: JSON.stringify([
          { id: "a-1", status: "in_progress" },
          { id: "b-2", status: "in_progress" },
        ]),
        stderr: "warn: stale index",
        code: 2,
      };
    });
    const issues = await listLive(pi, ["list"]);
    expect(calls).toHaveLength(3);
    expect(issues.map(issueId).sort()).toEqual(["a-1", "b-2"]);
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
