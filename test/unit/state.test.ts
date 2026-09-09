import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { statePath } from "../../core/lib/fsutil.ts";
import { emptyState, loadState, recordClosed, saveState } from "../../core/lib/state.ts";

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "beadfinder-state-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("SessionState lastSnapshotHash", () => {
  test("emptyState includes lastSnapshotHash as empty string", () => {
    expect(emptyState().lastSnapshotHash).toBe("");
  });

  test("loadState backfills lastSnapshotHash on old session files", () => {
    mkdirSync(join(dir, ".opencode", "beadfinder"), { recursive: true });
    writeFileSync(
      statePath(dir),
      JSON.stringify({
        sessions: {
          default: { persona: "implementer", claimedId: "auth-12", lastSnapshot: "old" },
        },
      }) + "\n",
      "utf8",
    );
    const st = loadState(dir, "default");
    expect(st.lastSnapshotHash).toBe("");
    expect(st.claimedId).toBe("auth-12");
    expect(st.persona).toBe("implementer");
  });

  test("saveState persists lastSnapshotHash per session", () => {
    const st = loadState(dir, "ses_a");
    st.lastSnapshotHash = "abc123";
    st.lastSnapshot = "snap";
    saveState(dir, "ses_a", st);
    expect(loadState(dir, "ses_a").lastSnapshotHash).toBe("abc123");
    expect(loadState(dir, "ses_b").lastSnapshotHash).toBe("");
    const raw = JSON.parse(readFileSync(statePath(dir), "utf8"));
    expect(raw.sessions.ses_a.lastSnapshotHash).toBe("abc123");
    expect(raw.sessions.ses_b).toBeUndefined();
  });
});

describe("legacy store + recordClosed", () => {
  test("missing state file yields empty state", () => {
    const st = loadState(dir);
    expect(st).toEqual(emptyState());
    expect(st.booted).toBe(false);
  });

  test("legacy flat file migrates into sessions.default", () => {
    mkdirSync(join(dir, ".opencode", "beadfinder"), { recursive: true });
    writeFileSync(
      statePath(dir),
      JSON.stringify({
        persona: "implementer",
        claimedId: "beads-w1-t2.1",
        claimedAt: "2026-01-01T00:00:00.000Z",
        seenClosed: { "beads-old.1": "2026-01-01T00:00:00.000Z" },
      }) + "\n",
      "utf8",
    );
    const st = loadState(dir);
    expect(st.persona).toBe("implementer");
    expect(st.claimedId).toBe("beads-w1-t2.1");
    expect(st.seenClosed["beads-old.1"]).toBeTruthy();
    expect(st.booted).toBe(false);

    saveState(dir, "default", st);
    const rawAfter = JSON.parse(readFileSync(statePath(dir), "utf8"));
    expect(rawAfter.sessions.default.claimedId).toBe("beads-w1-t2.1");
    expect(rawAfter.sessions.default.booted).toBe(false);
  });

  test("recordClosed records the id and clears a matching claim only for that session", () => {
    const a = loadState(dir, "ses_a");
    a.claimedId = "beads-a.1";
    a.claimedAt = "2026-01-01T00:00:00.000Z";
    saveState(dir, "ses_a", a);

    const after = recordClosed(dir, "ses_a", "beads-a.1");
    expect(after.claimedId).toBe("");
    expect(after.claimedAt).toBe("");
    expect(after.seenClosed["beads-a.1"]).toBeTruthy();

    const b = loadState(dir, "ses_b");
    expect(b.claimedId).toBe("");
    expect(b.seenClosed["beads-a.1"]).toBeUndefined();
  });

  test("recordClosed with an unrelated id records it but keeps the claim", () => {
    const a = loadState(dir, "ses_a");
    a.claimedId = "beads-a.1";
    saveState(dir, "ses_a", a);

    const after = recordClosed(dir, "ses_a", "beads-other.2");
    expect(after.claimedId).toBe("beads-a.1");
    expect(after.seenClosed["beads-other.2"]).toBeTruthy();
  });
});
