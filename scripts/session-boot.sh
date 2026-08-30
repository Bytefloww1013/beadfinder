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

# One JSON document. Beads wants comma-separated --status (repeating overwrites).
# Fall back to merging two queries so we never print `[]` then a second array.
list_live() {
  local out=""
  if out="$(bd list "$@" --status open,in_progress --json 2>/dev/null)" && [[ -n "$out" ]]; then
    printf '%s\n' "$out"
    return 0
  fi
  python3 - "$@" <<'PY' || true
import json, subprocess, sys

def take(raw, seen, order):
    raw = (raw or "").strip()
    if not raw:
        return
    try:
        data = json.loads(raw)
    except Exception:
        return
    if isinstance(data, dict):
        data = data.get("issues") or data.get("items") or ([data] if data.get("id") else [])
    if not isinstance(data, list):
        return
    for item in data:
        if not isinstance(item, dict):
            continue
        i = item.get("id")
        if i and i not in seen:
            seen[i] = item
            order.append(i)

seen = {}
order = []
args = sys.argv[1:]
for status in ("open", "in_progress"):
    p = subprocess.run(
        ["bd", "list", *args, "--status", status, "--json"],
        capture_output=True,
        text=True,
    )
    take(p.stdout, seen, order)
print(json.dumps([seen[i] for i in order], indent=2))
PY
}

echo "=== bd prime ==="
bd prime || true

echo
echo "Beads store is .beads/ (hidden). Do not glob beads/. Use bd show/list --json."
echo
echo "=== live destinations (open + in_progress) ==="
list_live --label beadfinder:destination --type epic

echo
echo "=== live slices (open + in_progress, any type) ==="
list_live --label beadfinder:slice

echo
echo "=== in progress (any label) ==="
bd list --status in_progress --json || true

echo
echo "=== ready work ==="
bd ready --limit 20 --json || true

if [[ -n "$PARENT" && -n "$PERSONA" ]]; then
  echo
  echo "=== frontier $PERSONA under $PARENT ==="
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  bash "$SCRIPT_DIR/frontier.sh" --parent "$PARENT" --persona "$PERSONA" || true
fi
