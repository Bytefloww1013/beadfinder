/**
 * Adapter-agnostic reviewer close-guard policy core.
 *
 * Pure functions only: no cwd, no I/O, no advisor, no throwing. Each adapter's
 * policy.ts imports `evaluateCloseGuard` and maps a `{ ok: false, hook, message }`
 * result onto its own local shim (throwBlock in cline/opencode, block in ohmypi).
 * This file is vendored to all three adapters by scripts/sync-adapters.ts.
 */

export type RubricScores = { quality: number; correctness: number; pillars: number };

export type CloseGuardResult =
  | { ok: true; scores: RubricScores }
  | { ok: false; hook: string; message: string };

export function parseRubricScores(text: string): RubricScores | null {
  const parseDim = (pat: string): number | null => {
    const m = text.match(new RegExp(`(^|[^a-zA-Z0-9])${pat}[^0-9\\r\\n]*([0-9]+)\\s*\\/\\s*10`, "i"));
    return m ? parseInt(m[2], 10) : null;
  };
  const quality = parseDim("quality");
  const correctness = parseDim("correctness");
  const pillars = parseDim("pillars?");
  if (quality === null || correctness === null || pillars === null) return null;
  return { quality, correctness, pillars };
}

/**
 * Evaluate a reviewer close reason. Pass bar is >= 8 on all three dimensions;
 * scores must be within [1, 10] and the reason must contain "Review PASS".
 */
export function evaluateCloseGuard(reason: string): CloseGuardResult {
  const parsed = parseRubricScores(reason);
  if (!/Review PASS/i.test(reason) || !parsed) {
    return {
      ok: false,
      hook: "bd-close-guard",
      message:
        "Reviewer close reason must record all three scores: quality, correctness, pillars (e.g. Review PASS: quality 9/10, correctness 8/10, pillars 9/10.).",
    };
  }
  const dims = ["quality", "correctness", "pillars"] as const;
  const oob = dims.filter((d) => parsed[d] < 1 || parsed[d] > 10).map((d) => `${d} ${parsed[d]}/10`);
  if (oob.length) {
    return {
      ok: false,
      hook: "bd-close-guard",
      message: `Rubric scores out of bounds [1-10]: ${oob.join(", ")}`,
    };
  }
  const low = dims.filter((d) => parsed[d] < 8).map((d) => `${d} ${parsed[d]}/10`);
  if (low.length) {
    return {
      ok: false,
      hook: "bd-close-guard",
      message: `Scores below pass bar (>= 8): ${low.join(", ")}`,
    };
  }
  return { ok: true, scores: parsed };
}