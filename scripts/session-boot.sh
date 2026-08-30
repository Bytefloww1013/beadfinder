#!/usr/bin/env bash
# Session start: prime memories, list open destination epics, show frontier if --parent given.
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

echo "=== bd prime ==="
bd prime || true

echo
echo "=== open destinations ==="
bd list --label beadfinder:destination --type epic --status open --json || true

echo
echo "=== open slices ==="
bd list --label beadfinder:slice --type epic --status open --json || true

if [[ -n "$PARENT" && -n "$PERSONA" ]]; then
  echo
  echo "=== frontier $PERSONA under $PARENT ==="
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  "$SCRIPT_DIR/frontier.sh" --parent "$PARENT" --persona "$PERSONA" || true
fi
