import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBeadfinder } from "./policy.ts";
import { loadState, saveState } from "./state.ts";

let dir = "";
const sessionID = "ses_test";

function plugin() {
  return createBeadfinder({
    client: { session: { prompt: async () => ({}) } },
    directory: dir,
  });
}

async function before(tool: string, args: Record<string, unknown>) {
  const hooks = plugin();
  await hooks["tool.execute.before"]({ tool, sessionID }, { args });
}

describe("OpenCode policy hooks", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "beadfinder-oc-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("env-protection blocks .env reads", async () => {
    await expect(before("read", { filePath: ".env" })).rejects.toThrow(/\[beadfinder:env-protection\]/);
  });

  test("beads-store blocks glob of beads/", async () => {
    await expect(before("glob", { pattern: "beads/**" })).rejects.toThrow(/\[beadfinder:beads-store\]/);
  });

  test("reviewer cannot write product files", async () => {
    const st = loadState(dir, sessionID);
    st.persona = "reviewer";
    saveState(dir, sessionID, st);
    await expect(before("write", { filePath: "src/app.ts" })).rejects.toThrow(/\[beadfinder:persona-fs-guard\]/);
  });

  test("apply_patch into src is a product write for wayfinder", async () => {
    const st = loadState(dir, sessionID);
    st.persona = "wayfinder";
    saveState(dir, sessionID, st);
    await expect(
      before("apply_patch", { patchText: "*** Update File: src/app.ts\n@@\n-a\n+b\n" }),
    ).rejects.toThrow(/\[beadfinder:persona-fs-guard\]/);
  });

  test("implementer product write without a claim is blocked", async () => {
    const st = loadState(dir, sessionID);
    st.persona = "implementer";
    saveState(dir, sessionID, st);
    await expect(before("edit", { filePath: "src/app.ts" })).rejects.toThrow(/\[beadfinder:claim-gate\]/);
  });

  test("HITL spawn is blocked", async () => {
    await expect(
      before("task", { prompt: "Please grill this hitl ticket", description: "grill", subagent_type: "product" }),
    ).rejects.toThrow(/\[beadfinder:hitl-affinity\]/);
  });

  test("spawn-contract requires the three phrases", async () => {
    await expect(
      before("task", { prompt: "implement login", description: "login", subagent_type: "implementer" }),
    ).rejects.toThrow(/\[beadfinder:spawn-contract\]/);
  });

  test("a complete spawn contract is allowed", async () => {
    await before("task", {
      prompt: "Ticket auth-12 under slice-1. one ticket only. claim before work. Follow the ADR gist.",
      description: "auth-12",
      subagent_type: "implementer",
    });
  });

  test("beads-only blocks gh issue create", async () => {
    await expect(before("bash", { command: "gh issue create --title x" })).rejects.toThrow(/\[beadfinder:beads-only\]/);
  });

  test("compact-preserve includes claimed id", async () => {
    const st = loadState(dir, sessionID);
    st.claimedId = "auth-12";
    st.persona = "implementer";
    st.lastSnapshot = "Live Beads snapshot (do not trust earlier chat for ticket status): none";
    saveState(dir, sessionID, st);
    const output = { context: [] as string[] };
    await plugin()["experimental.session.compacting"]({ sessionID }, output);
    expect(output.context.some((l) => l.includes("auth-12"))).toBe(true);
    expect(output.context.some((l) => l.includes("implementer"))).toBe(true);
  });

  test("session state is isolated by session id", () => {
    const a = loadState(dir, "ses_a");
    a.claimedId = "a-1";
    saveState(dir, "ses_a", a);
    const b = loadState(dir, "ses_b");
    expect(b.claimedId).toBe("");
    expect(loadState(dir, "ses_a").claimedId).toBe("a-1");
  });
});
