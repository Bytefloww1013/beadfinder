#!/usr/bin/env bash
# Session start: prime memories, list live destination/slice tickets and ready work.
set -euo pipefail

PERSONA=""
PARENT=""
JSON=0

usage() {
  echo "usage: session-boot.sh [--json] [--persona name] [--parent slice-id]" >&2
  echo "  --json     dump raw JSON (default: compact tables)" >&2
  echo "  --persona  persona name (enables frontier with --parent)" >&2
  echo "  --parent   slice/epic id (enables frontier with --persona)" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) JSON=1; shift ;;
    --persona) PERSONA="${2:-}"; shift 2 ;;
    --parent) PARENT="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

if ! command -v bd >/dev/null 2>&1; then
  echo '{"error":"bd not on PATH"}' >&2
  exit 1
fi

if [[ "$JSON" -eq 0 ]] && ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required for table output; install jq or pass --json" >&2
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

# Beads may return an array or an object wrapping issues/items.
print_rows() {
  local json="${1:-}"
  local rows=""
  if [[ -z "$json" || "$json" == "null" ]]; then
    echo "  (none)"
    return 0
  fi
  if rows="$(printf '%s' "$json" | jq -r '
    (if type == "array" then .
     elif type == "object" then (.issues // .items // (if has("id") then [.] else [] end))
     else [] end)
    | if length == 0 then "  (none)"
      else .[] | "  \(.id) [\(.status)] \(.title)"
      end
  ' 2>/dev/null)" && [[ -n "$rows" ]]; then
    printf '%s\n' "$rows"
  else
    echo "  (none)"
  fi
}

echo "=== bd prime ==="
bd prime || true

if [[ "$JSON" -eq 1 ]]; then
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
else
  echo
  echo "=== Beadfinder Live Context ==="
  echo "Store: .beads/ (hidden). Use 'bd show <id> --json' for task details."
  echo
  echo "--- Destinations ---"
  print_rows "$(list_live --label beadfinder:destination --type epic)"
  echo "--- Active Slices ---"
  print_rows "$(list_live --label beadfinder:slice)"
  echo "--- In Progress ---"
  print_rows "$(bd list --status in_progress --json || true)"
  echo "--- Ready Work (Frontier) ---"
  print_rows "$(bd ready --limit 10 --json || true)"

  if [[ -n "$PARENT" && -n "$PERSONA" ]]; then
    echo "--- Frontier ($PERSONA under $PARENT) ---"
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    print_rows "$(bash "$SCRIPT_DIR/frontier.sh" --parent "$PARENT" --persona "$PERSONA" || true)"
  fi
fi
