#!/usr/bin/env bash
# Smoke test: verifies the review handoff loop end-to-end against a THROWAWAY
# bd store in a scratch temp directory (mktemp -d + bd init --quiet). Sibling
# handoff scripts are invoked by absolute path with cwd set to the scratch
# dir, so the host repo store is never touched. The scratch dir is removed
# via trap on EXIT.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v bd >/dev/null 2>&1; then
  echo '{"error":"bd not on PATH"}' >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo '{"error":"jq not on PATH"}' >&2
  exit 1
fi

die() { echo "$1" >&2; exit 1; }

PASS_COUNT=0
ok() { PASS_COUNT=$((PASS_COUNT + 1)); }

# Scratch store; removed on EXIT. Warning, not silence, on rm failure.
SCRATCH=""
cleanup() {
  [[ -z "$SCRATCH" ]] && return 0
  rm -rf "$SCRATCH" || echo "verify-review-flow: warning: failed to remove $SCRATCH" >&2
}
trap cleanup EXIT

SCRATCH="$(mktemp -d)"
(cd "$SCRATCH" && bd init --quiet) >/dev/null 2>&1 \
  || die "bd init failed in scratch dir $SCRATCH"

in_scratch() { (cd "$SCRATCH" && "$@"); }

show_bead() {
  (cd "$SCRATCH" && bd show "$1" --json 2>/dev/null) \
    | jq -c '(if type == "array" then .[0] else . end)'
}

labels_of() {
  show_bead "$1" | jq -c '(.labels // [])'
}

# Positive bead: born into the implement phase with BOTH phase + role labels
# (backward compatible).
out="$(in_scratch bd create "verify-review-flow smoke test" -t task -p 3 --label phase:implement --label implementation --no-inherit-labels --json)" \
  || die "bd create (positive bead) failed"
BEAD="$(jq -r '(if type == "array" then .[0] else . end) | .id' <<<"$out")"

# Phase-only bead: ONLY phase:implement (stranded-ticket fix).
out="$(in_scratch bd create "verify-review-flow smoke test (phase-only)" -t task -p 3 --label phase:implement --no-inherit-labels --json)" \
  || die "bd create (phase-only bead) failed"
PHASE_ONLY="$(jq -r '(if type == "array" then .[0] else . end) | .id' <<<"$out")"

# Negative bead: neither phase:implement nor phase:review.
out="$(in_scratch bd create "verify-review-flow smoke test (negative)" -t task -p 3 --no-inherit-labels --json)" \
  || die "bd create (negative bead) failed"
NEG="$(jq -r '(if type == "array" then .[0] else . end) | .id' <<<"$out")"

# Claim the smoke bead so review-submit's unassign is actually observable
# (it is born unassigned; without the claim, step f would hold vacuously).
in_scratch bd update "$BEAD" --claim --json >/dev/null \
  || die "pre-a: claim failed"

# a. Submit for review. Phase swap only; role labels may remain.
in_scratch bash "$SCRIPT_DIR/review-submit.sh" "$BEAD" --summary "smoke" >/dev/null \
  || die "step a: review-submit.sh exited non-zero"
bead_json="$(show_bead "$BEAD")" || die "bd show failed for $BEAD"
labels="$(jq -c '(.labels // [])' <<<"$bead_json")"
jq -e 'index("phase:review") != null and index("phase:implement") == null' >/dev/null <<<"$labels" \
  || die "step a: expected phase:review, no phase:implement; got: $labels"
ok
# Backward compatible: the implementation role label is left in place, and
# the review role label is not added. Exact membership — contains("review")
# would also match the phase:review string.
jq -e 'index("implementation") != null and index("review") == null' >/dev/null <<<"$labels" \
  || die "step a: expected implementation to remain and review role not added; got: $labels"
ok

# f. Unassign + reopen invariant.
jq -e '((.assignee // "") == "") and .status == "open"' >/dev/null <<<"$bead_json" \
  || die "step f: expected unassigned + open after submit; got: $bead_json"
ok

# b. Fail verdict returns it to implement (and unassigns + reopens).
# Re-claim first so the fail path's unassign is observable as well.
in_scratch bd update "$BEAD" --claim --json >/dev/null \
  || die "pre-b: claim failed"
in_scratch bash "$SCRIPT_DIR/review-verdict.sh" "$BEAD" --fail --reason "smoke fail" >/dev/null \
  || die "step b: review-verdict.sh --fail exited non-zero"
bead_json="$(show_bead "$BEAD")" || die "bd show failed for $BEAD"
jq -e '(((.labels // []) | (index("phase:implement") != null and index("phase:review") == null)) and ((.assignee // "") == "") and .status == "open")' >/dev/null <<<"$bead_json" \
  || die "step b: expected phase:implement, no phase:review, unassigned + open; got: $bead_json"
ok

# c. Re-submit.
in_scratch bash "$SCRIPT_DIR/review-submit.sh" "$BEAD" --summary "smoke 2" >/dev/null \
  || die "step c: review-submit.sh exited non-zero"
labels="$(labels_of "$BEAD")"
jq -e 'index("phase:review") != null and index("phase:implement") == null' >/dev/null <<<"$labels" \
  || die "step c: expected phase:review, no phase:implement after re-submit; got: $labels"
ok

# i. Phase-only bead (no implementation role label) CAN be submitted.
in_scratch bd update "$PHASE_ONLY" --claim --json >/dev/null \
  || die "pre-i: claim failed"
in_scratch bash "$SCRIPT_DIR/review-submit.sh" "$PHASE_ONLY" --summary "phase-only smoke" >/dev/null \
  || die "step i: review-submit.sh rejected a phase:implement bead missing the implementation role label"
bead_json="$(show_bead "$PHASE_ONLY")" || die "bd show failed for $PHASE_ONLY"
labels="$(jq -c '(.labels // [])' <<<"$bead_json")"
jq -e 'index("phase:review") != null and index("phase:implement") == null' >/dev/null <<<"$labels" \
  || die "step i: expected phase:review, no phase:implement; got: $labels"
ok
jq -e '((.assignee // "") == "") and .status == "open"' >/dev/null <<<"$bead_json" \
  || die "step i: expected unassigned + open after phase-only submit; got: $bead_json"
ok
# Fail path on the phase-only bead: back to phase:implement; no role labels added.
in_scratch bd update "$PHASE_ONLY" --claim --json >/dev/null \
  || die "pre-i-fail: claim failed"
in_scratch bash "$SCRIPT_DIR/review-verdict.sh" "$PHASE_ONLY" --fail --reason "phase-only fail" >/dev/null \
  || die "step i: review-verdict.sh --fail on phase-only bead exited non-zero"
bead_json="$(show_bead "$PHASE_ONLY")" || die "bd show failed for $PHASE_ONLY"
jq -e '(((.labels // []) | (index("phase:implement") != null and index("phase:review") == null)) and ((.assignee // "") == "") and .status == "open")' >/dev/null <<<"$bead_json" \
  || die "step i: expected phase:implement, no phase:review, unassigned + open after fail; got: $bead_json"
ok
jq -e '((.labels // []) | (index("implementation") == null and index("review") == null))' >/dev/null <<<"$bead_json" \
  || die "step i: fail path must not add role labels; got: $bead_json"
ok

# g. --pass validation: reasons lacking "Review PASS" or the rubric's three
# dimensions are rejected, no mutation.
if in_scratch bash "$SCRIPT_DIR/review-verdict.sh" "$BEAD" --pass --reason "looks good to me" >/dev/null 2>&1; then
  die "step g: review-verdict.sh --pass accepted a reason without Review PASS + scores"
fi
ok
if in_scratch bash "$SCRIPT_DIR/review-verdict.sh" "$BEAD" --pass --reason "Review PASS: found 3/10 bugs, 2/10 flaky tests, 1/10 doc gaps, approving" >/dev/null 2>&1; then
  die "step g: review-verdict.sh --pass accepted N/10 tokens without the rubric dimensions"
fi
ok
# Rubric pass bar: a dimension below 8 is rejected even in valid format.
if in_scratch bash "$SCRIPT_DIR/review-verdict.sh" "$BEAD" --pass --reason "Review PASS: quality 7/10, correctness 9/10, pillars 9/10" >/dev/null 2>&1; then
  die "step g: review-verdict.sh --pass accepted a score below the rubric pass bar (>= 8)"
fi
ok
# Rubric bounds: scores > 10 (e.g. 999/10, 11/10) or < 1 (e.g. 0/10) must be rejected.
if in_scratch bash "$SCRIPT_DIR/review-verdict.sh" "$BEAD" --pass --reason "Review PASS: quality 999/10, correctness 9/10, pillars 9/10" >/dev/null 2>&1; then
  die "step g: review-verdict.sh --pass accepted a score > 10 (999/10)"
fi
ok
if in_scratch bash "$SCRIPT_DIR/review-verdict.sh" "$BEAD" --pass --reason "Review PASS: quality 11/10, correctness 9/10, pillars 9/10" >/dev/null 2>&1; then
  die "step g: review-verdict.sh --pass accepted a score > 10 (11/10)"
fi
ok
if in_scratch bash "$SCRIPT_DIR/review-verdict.sh" "$BEAD" --pass --reason "Review PASS: quality 0/10, correctness 9/10, pillars 9/10" >/dev/null 2>&1; then
  die "step g: review-verdict.sh --pass accepted a score < 1 (0/10)"
fi
ok
bead_json="$(show_bead "$BEAD")" || die "bd show failed for $BEAD"
jq -e '(.status != "closed") and ((.labels // []) | index("phase:review") != null)' >/dev/null <<<"$bead_json" \
  || die "step g: rejected --pass mutated the bead; got: $bead_json"
ok

# d. Pass verdict with the scored reason closes the bead.
in_scratch bash "$SCRIPT_DIR/review-verdict.sh" "$BEAD" --pass --reason "Review PASS: quality 8/10, correctness 8/10, pillars 8/10. smoke" >/dev/null \
  || die "step d: review-verdict.sh --pass exited non-zero"
bead_json="$(show_bead "$BEAD")" || die "bd show failed for $BEAD"
jq -e '.status == "closed"' >/dev/null <<<"$bead_json" \
  || die "step d: expected status closed"
ok

# e. Submit without phase:implement must be rejected.
if in_scratch bash "$SCRIPT_DIR/review-submit.sh" "$NEG" --summary "smoke" >/dev/null 2>&1; then
  die "step e: review-submit.sh accepted a bead missing phase:implement"
fi
ok
labels="$(labels_of "$NEG")"
jq -e 'index("phase:review") == null' >/dev/null <<<"$labels" \
  || die "step e: rejected bead was mutated to phase:review"
ok

# h. Verdict on a bead not in phase:review must be rejected.
if in_scratch bash "$SCRIPT_DIR/review-verdict.sh" "$NEG" --fail --reason "smoke" >/dev/null 2>&1; then
  die "step h: review-verdict.sh accepted a bead not in phase:review"
fi
ok

echo "verify-review-flow: PASS ($PASS_COUNT assertions)"
