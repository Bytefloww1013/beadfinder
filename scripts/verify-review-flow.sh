#!/usr/bin/env bash
# Smoke test: the full review loop (submit -> fail -> resubmit -> pass) against
# a throwaway bd store in a temp dir. Prints PASS/FAIL per assertion and exits
# non-zero if any fail.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cd "$TMP"
bd init --quiet >/dev/null 2>&1

PASS=0
FAIL=0

assert() {
  local name="$1"; shift
  if "$@"; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name"
    FAIL=$((FAIL + 1))
  fi
}

state_is() { # <id> <phase-label> <persona-label>: open, unassigned, exactly those two labels
  bd show "$1" --json 2>/dev/null | jq -e --arg p "$2" --arg s "$3" \
    '(if type == "array" then .[0] else . end)
     | .status == "open"
       and ((.assignee // "") == "")
       and ((.labels // []) | sort) == ([$p, $s] | sort)' >/dev/null
}

closed_is() {
  bd show "$1" --json 2>/dev/null | jq -e '(if type == "array" then .[0] else . end) | .status == "closed"' >/dev/null
}

submit_ok() {
  bash "$SCRIPT_DIR/review-submit.sh" "$ID" --summary "smoke: submitted for review" >/dev/null &&
    state_is "$ID" phase:review review
}

fail_ok() {
  bash "$SCRIPT_DIR/review-verdict.sh" "$ID" --fail \
    --reason "Review FAIL: quality 4/10, correctness 5/10, pillars 6/10. ranked issues here" >/dev/null &&
    state_is "$ID" phase:implement implementation
}

pass_ok() {
  bash "$SCRIPT_DIR/review-verdict.sh" "$ID" --pass \
    --reason "Review PASS: quality 9/10, correctness 9/10, pillars 8/10. smoke" >/dev/null &&
    closed_is "$ID"
}

submit_rejects() {
  ! bash "$SCRIPT_DIR/review-submit.sh" "$ID" >/dev/null &&
    state_is "$ID" phase:review review
}

verdict_rejects() {
  ! bash "$SCRIPT_DIR/review-verdict.sh" "$ID" --fail --reason "should not apply" >/dev/null &&
    state_is "$ID" phase:implement implementation
}

verdict_rejects_empty_reason() {
  ! bash "$SCRIPT_DIR/review-verdict.sh" "$ID" --pass --reason "" >/dev/null &&
    state_is "$ID" phase:review review
}

verdict_rejects_both_flags() {
  ! bash "$SCRIPT_DIR/review-verdict.sh" "$ID" --pass --fail --reason "ambiguous" >/dev/null &&
    state_is "$ID" phase:review review
}

verdict_rejects_unknown_id() {
  ! bash "$SCRIPT_DIR/review-verdict.sh" "nonexistent-bead-zz" --fail --reason "x" >/dev/null
}

fail_rejects_closed() {
  ! bash "$SCRIPT_DIR/review-verdict.sh" "$ID" --fail --reason "Review FAIL: resurrect attempt" >/dev/null &&
    closed_is "$ID"
}

ID="$(bd create "review flow smoke" --label phase:implement --label implementation --json | jq -r '.id')"
[[ -n "$ID" ]] || { echo "FAIL: could not create test bead"; exit 1; }

assert "submit moves bead to review queue (phase:review + review, open, unassigned)" submit_ok
assert "submit rejects already-submitted bead, no mutation" submit_rejects
assert "fail verdict returns bead to implement (phase:implement + implementation, open, unassigned)" fail_ok
assert "verdict rejects non-review bead, no mutation" verdict_rejects
assert "submit returns reworked bead to review queue" submit_ok
assert "verdict rejects BOTH --pass and --fail, no mutation" verdict_rejects_both_flags
assert "verdict rejects empty reason, no mutation" verdict_rejects_empty_reason
assert "verdict rejects unknown bead id" verdict_rejects_unknown_id
assert "pass verdict closes bead" pass_ok
assert "fail verdict rejects closed bead, no resurrection (closed-guard)" fail_rejects_closed

echo
echo "$PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
