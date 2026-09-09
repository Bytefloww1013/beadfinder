#!/usr/bin/env bash
# Test runner compressor: captures command output, emits decisive summaries (v0.8.0).
set -uo pipefail

usage() {
  echo "usage: test-run.sh <command...>" >&2
  exit 1
}

if [[ $# -eq 0 ]]; then
  usage
fi

CMD_STR="$*"
TMP_OUT="$(mktemp)"
cleanup() {
  rm -f "$TMP_OUT"
}
trap cleanup EXIT

exit_code=0
"$@" > "$TMP_OUT" 2>&1 || exit_code=$?

if [[ "$exit_code" -eq 0 ]]; then
  echo "✓ Verification passed: $CMD_STR"
  tail -n 15 "$TMP_OUT"
  exit 0
else
  echo "✗ Verification failed (exit $exit_code): $CMD_STR"
  excerpts="$(grep -E -i '(FAIL|Error|AssertionError|Exception|panic|fatal)' "$TMP_OUT" | head -n 30 || true)"
  if [[ -n "$excerpts" ]]; then
    printf '%s\n' "$excerpts"
  else
    head -n 30 "$TMP_OUT"
  fi
  exit "$exit_code"
fi
