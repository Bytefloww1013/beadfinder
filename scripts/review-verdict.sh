#!/usr/bin/env bash
# Handoff T3: reviewer verdict on a bead in the review queue.
# --pass closes the bead (the reason must carry the three scores per the
# contract; the script just closes with it). --fail posts the reason as a
# comment and sends the bead back to implement.
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

out="$(bd show "$ID" --json 2>/dev/null)" || {
  echo '{"error":"bead not found","id":"'"$ID"'"}' >&2
  exit 1
}

bead="$(printf '%s' "$out" | jq -c '(if type == "array" then .[0] else . end) | {status: (.status // ""), labels: (.labels // [])}')"

if [[ "$(jq -r '.status' <<<"$bead")" == "closed" ]]; then
  echo '{"error":"bead is closed","id":"'"$ID"'"}' >&2
  exit 1
fi

if ! jq -e '.labels | contains(["phase:review", "review"])' >/dev/null <<<"$bead"; then
  echo '{"error":"bead not in phase:review + review state","id":"'"$ID"'"}' >&2
  exit 1
fi

if [[ -n "$PASS" ]]; then
  bd close "$ID" --reason "$REASON" --json
  exit 0
fi

bd comment "$ID" "$REASON" >/dev/null
bd update "$ID" --remove-label phase:review --remove-label review \
  --add-label phase:implement --add-label implementation --assignee "" --status open --json
