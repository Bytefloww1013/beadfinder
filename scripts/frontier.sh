#!/usr/bin/env bash
# List unclaimed, unblocked tickets for a slice + persona. Does not claim.
# Discovery key is the phase:* label mapped from --persona, not a role label.
set -euo pipefail

usage() {
  echo "usage: frontier.sh --parent <id> --persona <wayfinder|research|architect|implementer|reviewer|product> [--label extra] [--limit n]" >&2
  exit 1
}

PARENT=""
PERSONA=""
EXTRA_LABEL=""
LIMIT="20"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --parent) PARENT="${2:-}"; shift 2 ;;
    --persona) PERSONA="${2:-}"; shift 2 ;;
    --label) EXTRA_LABEL="${2:-}"; shift 2 ;;
    --limit) LIMIT="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done

[[ -n "$PARENT" && -n "$PERSONA" ]] || usage

if ! command -v bd >/dev/null 2>&1; then
  echo '{"error":"bd not on PATH"}' >&2
  exit 1
fi

case "$PERSONA" in
  wayfinder) PHASE_LABEL="phase:plan" ;;
  research) PHASE_LABEL="phase:requirements" ;;
  architect) PHASE_LABEL="phase:design" ;;
  implementer) PHASE_LABEL="phase:implement" ;;
  reviewer) PHASE_LABEL="phase:review" ;;
  product) PHASE_LABEL="phase:requirements" ;;
  *) echo "unknown persona: $PERSONA" >&2; exit 1 ;;
esac

args=(ready --parent "$PARENT" --label "$PHASE_LABEL" --unassigned --limit "$LIMIT" --json)
if [[ -n "$EXTRA_LABEL" ]]; then
  args+=(--label "$EXTRA_LABEL")
fi

bd "${args[@]}"
