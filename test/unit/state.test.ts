import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { statePath } from "../../core/lib/fsutil.ts";
import { emptyState, loadState, saveState } from "../../core/lib/state.ts";

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
