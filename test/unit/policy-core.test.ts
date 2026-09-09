import { describe, expect, test } from "bun:test";
import { evaluateCloseGuard, parseRubricScores } from "../../core/lib/policy-core.ts";

describe("evaluateCloseGuard", () => {
  test("valid scores at or above the pass bar pass", () => {
    const r = evaluateCloseGuard("Review PASS: quality 9/10, correctness 8/10, pillars 9/10");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.scores).toEqual({ quality: 9, correctness: 8, pillars: 9 });
    }
  });

  test("scores below the pass bar are rejected with the low message", () => {
    const r = evaluateCloseGuard("Review PASS: quality 7/10, correctness 9/10, pillars 9/10");
    expect(r).toEqual({
      ok: false,
      hook: "bd-close-guard",
      message: "Scores below pass bar (>= 8): quality 7/10",
    });
  });

  test("out-of-bounds scores are rejected with the bounds message", () => {
    const r = evaluateCloseGuard("Review PASS: quality 999/10, correctness 9/10, pillars 9/10");
    expect(r).toEqual({
      ok: false,
      hook: "bd-close-guard",
      message: "Rubric scores out of bounds [1-10]: quality 999/10",
    });
  });

  test("missing 'Review PASS' or missing dimensions get the three-scores message", () => {
    const three =
      "Reviewer close reason must record all three scores: quality, correctness, pillars (e.g. Review PASS: quality 9/10, correctness 8/10, pillars 9/10.).";
    expect(evaluateCloseGuard("looks good to me")).toEqual({
      ok: false,
      hook: "bd-close-guard",
      message: three,
    });
    expect(evaluateCloseGuard("Review PASS: quality 9/10, correctness 9/10")).toEqual({
      ok: false,
      hook: "bd-close-guard",
      message: three,
    });
  });

  test("'subquality 9/10' is not parsed as a quality score", () => {
    expect(parseRubricScores("Review PASS: subquality 9/10, correctness 9/10, pillars 9/10")).toBeNull();
    const r = evaluateCloseGuard("Review PASS: subquality 9/10, correctness 9/10, pillars 9/10");
    expect(r.ok).toBe(false);
  });
});
