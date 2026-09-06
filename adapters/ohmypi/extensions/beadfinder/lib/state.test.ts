import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { statePath } from "./fsutil.ts";
import { emptyState, loadState, recordClosed, saveState } from "./state.ts";

let dir = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "beadfinder-omp-state-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeFlatState(state: Record<string, unknown>): void {
  mkdirSync(join(dir, ".omp", "beadfinder"), { recursive: true });
  writeFileSync(statePath(dir), JSON.stringify(state, null, 2) + "\n", "utf8");
}

describe("OMP state store", () => {
  test("missing state file yields empty state", () => {
    const st = loadState(dir);
    expect(st).toEqual(emptyState());
    expect(st.booted).toBe(false);
  });

  test("legacy flat OMP-shaped file migrates into sessions.default", () => {
    writeFlatState({
      persona: "implementer",
      claimedId: "beads-w1-t2.1",
      claimedAt: "2026-01-01T00:00:00.000Z",
      seenClosed: { "beads-old.1": "2026-01-01T00:00:00.000Z" },
    });
    const st = loadState(dir);
    expect(st.persona).toBe("implementer");
    expect(st.claimedId).toBe("beads-w1-t2.1");
    expect(st.seenClosed["beads-old.1"]).toBeTruthy();
    // missing fields are backfilled
    expect(st.booted).toBe(false);

    const raw = JSON.parse(readFileSync(statePath(dir), "utf8"));
    expect(raw.sessions).toBeUndefined();
    // any save re-persists the migrated state under sessions.default
    saveState(dir, "default", st);
    const rawAfter = JSON.parse(readFileSync(statePath(dir), "utf8"));
    expect(rawAfter.sessions.default.claimedId).toBe("beads-w1-t2.1");
    expect(rawAfter.sessions.default.booted).toBe(false);
  });

  test("sessions are isolated: two keys do not see each other's claimedId", () => {
    const a = loadState(dir, "ses_a");
    a.claimedId = "beads-a.1";
    a.claimedAt = "2026-01-01T00:00:00.000Z";
    a.persona = "implementer";
    saveState(dir, "ses_a", a);

    const b = loadState(dir, "ses_b");
    expect(b.claimedId).toBe("");
    expect(b.persona).toBe("unknown");

    b.claimedId = "beads-b.9";
    b.persona = "reviewer";
    saveState(dir, "ses_b", b);

    const aAgain = loadState(dir, "ses_a");
    expect(aAgain.claimedId).toBe("beads-a.1");
    expect(aAgain.persona).toBe("implementer");
    const bAgain = loadState(dir, "ses_b");
    expect(bAgain.claimedId).toBe("beads-b.9");
    expect(bAgain.persona).toBe("reviewer");
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

    // other session untouched
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
