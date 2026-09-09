#!/usr/bin/env bash
# Atomically claim the next ready ticket for a slice + persona.
# Uses bd ready --claim (one transaction). Do not select-then-claim in two steps.
# Discovery key is the phase:* label mapped from --persona, not a role label.
set -euo pipefail

usage() {
  echo "usage: claim-next.sh --parent <id> --persona <wayfinder|research|architect|implementer|reviewer|product> [--label extra]" >&2
  exit 1
}

PARENT=""
PERSONA=""
EXTRA_LABEL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --parent) PARENT="${2:-}"; shift 2 ;;
    --persona) PERSONA="${2:-}"; shift 2 ;;
    --label) EXTRA_LABEL="${2:-}"; shift 2 ;;
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

args=(ready --parent "$PARENT" --label "$PHASE_LABEL" --unassigned --claim --limit 1 --json)
if [[ -n "$EXTRA_LABEL" ]]; then
  args+=(--label "$EXTRA_LABEL")
fi

out="$(bd "${args[@]}")" || {
  echo "$out"
  exit 1
}

if [[ -z "$out" || "$out" == "[]" || "$out" == "null" ]]; then
  echo '{"error":"empty frontier","parent":"'"$PARENT"'","persona":"'"$PERSONA"'"}' >&2
  exit 2
fi

echo "$out"
