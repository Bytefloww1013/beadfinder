import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PolicyBlock, PolicyEngine, type HarnessBridge } from "../../core/lib/engine.ts";
import * as bd from "../../core/lib/bd.ts";
import { loadState, saveState } from "../../core/lib/state.ts";

let dir = "";
let messages: { sessionId: string; message: string }[] = [];
let snap = "Live Beads snapshot (do not trust earlier chat for ticket status):\nReady work (bd ready): none";
let fakeIssue: Record<string, unknown> | null = null;
let spies: Array<{ mockRestore: () => void }> = [];

function bridge(): HarnessBridge {
  return {
    directory: dir,
    notify: async (sessionId, message) => {
      messages.push({ sessionId, message });
    },
    log: () => {},
  };
}

function engine(): PolicyEngine {
  return new PolicyEngine(bridge());
}

function mockBeads() {
  spies.push(
    spyOn(bd, "runBd").mockImplementation(async (_cwd: string, args: string[]) => {
      if (args[0] === "prime") return { ok: true, raw: "", json: null };
      if (args[0] === "show" && fakeIssue) {
        return { ok: true, raw: JSON.stringify([fakeIssue]), json: [fakeIssue] };
      }
      return { ok: true, raw: "[]", json: [] };
    }),
  );
  spies.push(
    spyOn(bd, "liveSnapshot").mockImplementation(async () => snap),
  );
}

describe("PolicyEngine", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "beadfinder-engine-"));
    messages = [];
    snap = "Live Beads snapshot (do not trust earlier chat for ticket status):\nReady work (bd ready): none";
    fakeIssue = null;
    mockBeads();
  });
  afterEach(() => {
    for (const s of spies) s.mockRestore();
    spies = [];
    rmSync(dir, { recursive: true, force: true });
  });

  test("compactContext is a single short tuple and omits lastSnapshot", () => {
    const huge = "HUGE-SNAPSHOT-PAYLOAD ".repeat(200);
    const st = loadState(dir, "ses");
    st.persona = "implementer";
    st.parent = "slice-1";
    st.claimedId = "auth-12";
    st.lastSnapshot = huge;
    saveState(dir, "ses", st);

    const bits = engine().compactContext("ses");
    expect(bits).toHaveLength(1);
    expect(bits[0]).toContain("implementer");
    expect(bits[0]).toContain("slice-1");
    expect(bits[0]).toContain("auth-12");
    expect(bits[0]).toContain("[beadfinder-active-state]");
    expect(bits.join("\n")).not.toContain("HUGE-SNAPSHOT-PAYLOAD");
    expect(bits[0].length).toBeLessThan(200);
  });

  test("identical snapshots do not notify twice; a changed ready-list does", async () => {
    const eng = engine();
    await eng.onSessionStart("ses");
    const first = messages.filter((m) => m.message.includes("Live Beads snapshot"));
    expect(first).toHaveLength(1);

    await eng.refreshAndInject("ses", true);
    expect(messages.filter((m) => m.message.includes("Live Beads snapshot"))).toHaveLength(1);

    snap = "Live Beads snapshot (do not trust earlier chat for ticket status):\nReady work (bd ready):\n- auth-12 [open] login";
    await eng.refreshAndInject("ses", true);
    const snaps = messages.filter((m) => m.message.includes("Live Beads snapshot"));
    expect(snaps).toHaveLength(2);
    expect(snaps[1].message).toContain("auth-12");
  });

  test("onChatMessage after boot does not notify", async () => {
    const eng = engine();
    await eng.onSessionStart("ses");
    const afterBoot = messages.length;
    await eng.onChatMessage("ses", "implementer", false);
    await eng.onChatMessage("ses", "implementer", true);
    expect(messages.length).toBe(afterBoot);
  });

  test("reviewer write to src/foo.ts throws PolicyBlock persona-fs-guard", async () => {
    const st = loadState(dir, "ses");
    st.persona = "reviewer";
    saveState(dir, "ses", st);
    await expect(engine().beforeToolExecute("ses", "write", { filePath: "src/foo.ts" })).rejects.toMatchObject({
      hook: "persona-fs-guard",
    });
    await expect(engine().beforeToolExecute("ses", "write", { filePath: "src/foo.ts" })).rejects.toThrow(PolicyBlock);
  });

  test("chained bd show && bd close without --reason is inspected (allBdInvocations)", async () => {
    await expect(
      engine().beforeToolExecute("ses", "bash", { command: "echo ok && bd close x" }),
    ).rejects.toThrow(/\[beadfinder:bd-close-guard\] bd close requires --reason/);

    await expect(
      engine().beforeToolExecute("ses", "bash", { command: "bd show ok && bd close dest" }),
    ).rejects.toThrow(/\[beadfinder:bd-close-guard\] bd close requires --reason/);
  });

  test("comment-bypass bd update -d is still map-append-only on a destination", async () => {
    fakeIssue = { id: "dest-1", status: "open", labels: ["beadfinder:destination"] };
    await expect(
      engine().beforeToolExecute("ses", "bash", {
        command: 'bd update dest-1 -d "Wiped" # append-decision.py',
      }),
    ).rejects.toThrow(/\[beadfinder:map-append-only\]/);
  });

  test("implementer product write without claim throws claim-gate", async () => {
    const st = loadState(dir, "ses");
    st.persona = "implementer";
    saveState(dir, "ses", st);
    await expect(engine().beforeToolExecute("ses", "write", { filePath: "src/foo.ts" })).rejects.toThrow(
      /\[beadfinder:claim-gate\]/,
    );
  });

  test("two session IDs have isolated claimedId in state.json", () => {
    const a = loadState(dir, "ses_a");
    a.claimedId = "a-1";
    a.persona = "implementer";
    saveState(dir, "ses_a", a);

    const b = loadState(dir, "ses_b");
    b.claimedId = "b-9";
    b.persona = "reviewer";
    saveState(dir, "ses_b", b);

    expect(loadState(dir, "ses_a").claimedId).toBe("a-1");
    expect(loadState(dir, "ses_b").claimedId).toBe("b-9");
    expect(engine().compactContext("ses_a")[0]).toContain("a-1");
    expect(engine().compactContext("ses_a")[0]).not.toContain("b-9");
    expect(engine().compactContext("ses_b")[0]).toContain("b-9");
    expect(engine().compactContext("ses_b")[0]).not.toContain("a-1");
  });
});
