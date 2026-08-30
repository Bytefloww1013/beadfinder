#!/usr/bin/env bash
# Session start: prime memories, list live destination/slice tickets and ready work.
set -euo pipefail

PERSONA=""
PARENT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --persona) PERSONA="${2:-}"; shift 2 ;;
    --parent) PARENT="${2:-}"; shift 2 ;;
    -h|--help)
      echo "usage: session-boot.sh [--persona name] [--parent slice-id]" >&2
      exit 1
      ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

if ! command -v bd >/dev/null 2>&1; then
  echo '{"error":"bd not on PATH"}' >&2
  exit 1
fi

# `in_progress` is live work. `--status open` does not always include it.
list_live() {
  bd list "$@" --status open --json || true
  bd list "$@" --status in_progress --json || true
}

echo "=== bd prime ==="
bd prime || true

echo
echo "=== live destinations (open + in_progress) ==="
list_live --label beadfinder:destination --type epic

echo
echo "=== live slices (open + in_progress, any type) ==="
list_live --label beadfinder:slice

echo
echo "=== ready work ==="
bd ready --limit 20 --json || true

if [[ -n "$PARENT" && -n "$PERSONA" ]]; then
  echo
  echo "=== frontier $PERSONA under $PARENT ==="
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  bash "$SCRIPT_DIR/frontier.sh" --parent "$PARENT" --persona "$PERSONA" || true
fi
