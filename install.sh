#!/usr/bin/env bash
# Copy beadfinder skills + persona agents into Oh My Pi or OpenCode.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: install.sh --omp|--opencode [--global] [--dest DIR] [--debug]

  --omp         Oh My Pi  (.omp/skills + .omp/agents + extensions)
  --opencode    OpenCode  (.opencode/skills + .opencode/agents)
  --global      user-wide dirs instead of the current project
  --dest DIR    override the harness root (implies not --global)
  --debug       also install beadfinder-debug (OMP log + status advisor)

Run from a clone of this pack, or via:
  bash /path/to/beadfinder/install.sh --omp
  bash /path/to/beadfinder/install.sh --omp --debug
EOF
  exit 1
}

HARNESS=""
GLOBAL=0
DEST_OVERRIDE=""
DEBUG=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --omp|--oh-my-pi|--ohmypi) HARNESS="omp" ;;
    --opencode) HARNESS="opencode" ;;
    --global|-g) GLOBAL=1 ;;
    --dest)
      DEST_OVERRIDE="${2:-}"
      [[ -n "$DEST_OVERRIDE" ]] || usage
      shift
      ;;
    --debug) DEBUG=1 ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
  shift
done

[[ -n "$HARNESS" ]] || usage

PACK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$PACK/SKILL.md" ]] || {
  echo "install.sh must live next to SKILL.md" >&2
  exit 1
}

if [[ -n "$DEST_OVERRIDE" ]]; then
  ROOT="$DEST_OVERRIDE"
elif [[ "$HARNESS" == "omp" ]]; then
  if [[ "$GLOBAL" -eq 1 ]]; then
    ROOT="${HOME}/.omp/agent"
  else
    ROOT="${PWD}/.omp"
  fi
else
  if [[ "$GLOBAL" -eq 1 ]]; then
    ROOT="${HOME}/.config/opencode"
  else
    ROOT="${PWD}/.opencode"
  fi
fi

SKILLS="$ROOT/skills"
AGENTS="$ROOT/agents"
mkdir -p "$SKILLS" "$AGENTS"

copy_skill() {
  local name="$1"
  local src="$2"
  local dest="$SKILLS/$name"
  rm -rf "$dest"
  mkdir -p "$dest"
  cp "$src/SKILL.md" "$dest/"
  if [[ -d "$src/scripts" ]]; then
    cp -R "$src/scripts" "$dest/"
    rm -rf "$dest/scripts/__pycache__"
    # session-boot.sh calls frontier.sh by path; 100644 copies fail with Permission denied
    find "$dest/scripts" -type f -name '*.sh' -exec chmod a+x {} + 2>/dev/null || true
  fi
  if [[ -d "$src/references" ]]; then
    cp -R "$src/references" "$dest/"
  fi
}

copy_skill beadfinder "$PACK"
copy_skill beadfinder-grill "$PACK/companions/beadfinder-grill"
copy_skill beadfinder-implement "$PACK/companions/beadfinder-implement"
copy_skill beadfinder-research "$PACK/companions/beadfinder-research"
copy_skill beadfinder-to-spec "$PACK/companions/beadfinder-to-spec"
copy_skill beadfinder-to-tickets "$PACK/companions/beadfinder-to-tickets"

if [[ "$DEBUG" -eq 1 ]]; then
  copy_skill beadfinder-debug "$PACK/companions/beadfinder-debug"
  mkdir -p "$SKILLS/beadfinder/scripts"
  cp "$PACK/scripts/debug-log.py" "$SKILLS/beadfinder/scripts/"
fi

if [[ "$HARNESS" == "omp" ]]; then
  cp "$PACK/adapters/ohmypi/agents/"*.md "$AGENTS/"
  EXT_ROOT="$ROOT/extensions"
  EXT="$EXT_ROOT/beadfinder"
  mkdir -p "$EXT_ROOT"
  # OMP treats every top-level *.ts under extensions/ as its own entry.
  # Older copies flattened index.ts + debug.ts here and then failed to resolve
  # firstBdInvocation. Wipe those strays before installing the pack folder.
  rm -f "$EXT_ROOT/index.ts" "$EXT_ROOT/debug.ts"
  rm -rf "$EXT_ROOT/lib" "$EXT"
  mkdir -p "$EXT"
  cp -R "$PACK/adapters/ohmypi/extensions/beadfinder/." "$EXT/"
  rm -f "$EXT/debug.ts"
  echo "extensions in $EXT"
  echo "only $EXT/index.ts is the OMP entry; helpers stay in $EXT/lib/"
  echo "if hooks do not fire, set .omp/settings.json to:"
  echo '  { "extensions": [".omp/extensions/beadfinder"] }'
else
  cp "$PACK/adapters/opencode/agents/"*.md "$AGENTS/"
fi

echo "installed to $SKILLS"
echo "agents in   $AGENTS"
if [[ "$DEBUG" -eq 1 ]]; then
  echo "debug skill on; log file will be <target-repo>/.omp/beadfinder-debug.log"
fi
echo
echo "in the target repo: bd init  (if needed)"
echo "append AGENTS.md.snippet to that repo's AGENTS.md"
echo "start the wayfinder agent"
