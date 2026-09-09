#!/usr/bin/env bash
# Handoff T3: reviewer verdict on a bead in the review queue (v0.8.0).
# Valid only from phase:review (role labels are optional and left as-is).
# Smoke-free contract: --pass closes the bead; the reason must carry
# "Review PASS" and the three N/10 scores (validated here). --fail posts the
# reason as a comment and swaps only the phase label back to implement.
set -euo pipefail

usage() {
  echo "usage: review-verdict.sh <bead-id> --pass|--fail --reason \"...\"" >&2
  exit 1
}

ID=""
PASS=""
FAIL=""
REASON=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pass) PASS=1; shift ;;
    --fail) FAIL=1; shift ;;
    --reason)
      if [[ $# -lt 2 ]]; then
        echo '{"error":"--reason requires a value"}' >&2
        exit 1
      fi
      REASON="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) if [[ -z "$ID" ]]; then ID="$1"; shift; else echo "unknown arg: $1" >&2; usage; fi ;;
  esac
done

[[ -n "$ID" ]] || usage

if [[ -n "$PASS" && -n "$FAIL" ]]; then
  echo '{"error":"--pass and --fail are mutually exclusive"}' >&2
  exit 1
fi

if [[ -z "$PASS" && -z "$FAIL" ]]; then
  echo '{"error":"verdict required: --pass or --fail","id":"'"$ID"'"}' >&2
  exit 1
fi

if [[ -z "$REASON" ]]; then
  echo '{"error":"empty --reason"}' >&2
  exit 1
fi

if ! command -v bd >/dev/null 2>&1; then
  echo '{"error":"bd not on PATH"}' >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo '{"error":"jq not on PATH"}' >&2
  exit 1
fi

if ! bead="$(bd show "$ID" --json 2>/dev/null | jq -e -c '(if type == "array" then (if length == 0 then error("not found") else .[0] end) else . end) | {status: (.status // ""), labels: (.labels // [])}')" || [[ -z "$bead" ]]; then
  echo '{"error":"bead not found","id":"'"$ID"'"}' >&2
  exit 1
fi

if [[ "$(jq -r '.status' <<<"$bead")" == "closed" ]]; then
  echo '{"error":"bead is closed","id":"'"$ID"'"}' >&2
  exit 1
fi

if ! jq -e '.labels | contains(["phase:review"])' >/dev/null <<<"$bead"; then
  echo '{"error":"bead not in phase:review state","id":"'"$ID"'"}' >&2
  exit 1
fi

if [[ -n "$PASS" ]]; then
  if ! grep -qi "Review PASS" <<<"$REASON" \
    || ! grep -qiE '(^|[^a-zA-Z0-9])quality[^0-9\r\n]*[0-9]+[[:space:]]*/[[:space:]]*10' <<<"$REASON" \
    || ! grep -qiE '(^|[^a-zA-Z0-9])correctness[^0-9\r\n]*[0-9]+[[:space:]]*/[[:space:]]*10' <<<"$REASON" \
    || ! grep -qiE '(^|[^a-zA-Z0-9])pillars?[^0-9\r\n]*[0-9]+[[:space:]]*/[[:space:]]*10' <<<"$REASON"; then
    echo '{"error":"--pass reason must contain \"Review PASS\" and the three rubric scores: quality N/10, correctness N/10, pillars N/10","id":"'"$ID"'"}' >&2
    exit 1
  fi
  # Rubric pass bar: every score must be bounded [1, 10] and >= 8 (references/review-rubric.md).
  below=""
  invalid=""
  for dim in quality correctness pillars; do
    pat="$dim"
    [[ "$dim" == "pillars" ]] && pat="pillars?"
    token="$(grep -oiE "(^|[^a-zA-Z0-9])${pat}[^0-9\r\n]*[0-9]+[[:space:]]*/[[:space:]]*10" <<<"$REASON" | head -1)"
    val="$(grep -oE '[0-9]+[[:space:]]*/[[:space:]]*10' <<<"$token" | grep -oE '^[0-9]+' | head -1)"
    val=$((10#${val:-0}))
    if [[ "$val" -lt 1 || "$val" -gt 10 ]]; then
      invalid="${invalid:+$invalid, }$dim $val/10"
    elif [[ "$val" -lt 8 ]]; then
      below="${below:+$below, }$dim $val/10"
    fi
  done
  if [[ -n "$invalid" ]]; then
    echo '{"error":"--pass rejected: rubric scores out of bounds [1-10]: '"$invalid"'","id":"'"$ID"'"}' >&2
    exit 1
  fi
  if [[ -n "$below" ]]; then
    echo '{"error":"--pass rejected: rubric scores below the pass bar (>= 8): '"$below"'","id":"'"$ID"'"}' >&2
    exit 1
  fi
  bd close "$ID" --reason "$REASON" --json
  exit 0
fi
comment_body="$REASON"
if ! grep -qi "Review FAIL" <<<"$REASON"; then
  if [[ "$REASON" =~ $'\n' ]]; then
    comment_body="Review FAIL"$'\n\n'"$REASON"
  else
    comment_body="Review FAIL: $REASON"
  fi
fi

bd comment "$ID" "$comment_body" >/dev/null
bd update "$ID" --remove-label phase:review \
  --add-label phase:implement --assignee "" --status open --json

