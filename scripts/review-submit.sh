#!/usr/bin/env bash
# Handoff T1: move a finished build bead from implement to the review queue (v0.8.0).
# Valid only from phase:implement (and not closed); unassigns and reopens so
# bd ready stays the single discovery mechanism for the reviewer. Role labels
# are optional metadata and are left as-is.
set -euo pipefail

usage() {
  echo "usage: review-submit.sh <bead-id> [--summary \"...\"]" >&2
  exit 1
}

ID=""
SUMMARY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --summary)
      if [[ $# -lt 2 ]]; then
        echo '{"error":"--summary requires a value"}' >&2
        exit 1
      fi
      SUMMARY="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) if [[ -z "$ID" ]]; then ID="$1"; shift; else echo "unknown arg: $1" >&2; usage; fi ;;
  esac
done

[[ -n "$ID" ]] || usage

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

if ! jq -e '.labels | contains(["phase:implement"])' >/dev/null <<<"$bead"; then
  echo '{"error":"bead not in phase:implement state","id":"'"$ID"'"}' >&2
  exit 1
fi

bd update "$ID" --remove-label phase:implement \
  --add-label phase:review --assignee "" --status open --json

bd comment "$ID" "${SUMMARY:-Submitted for review.}" >/dev/null
