#!/usr/bin/env bash
# Copy beadfinder skills + persona agents into Oh My Pi or OpenCode.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: install.sh --omp|--opencode [--global] [--dest DIR]

  --omp         Oh My Pi  (.omp/skills + .omp/agents)
  --opencode    OpenCode  (.opencode/skills + .opencode/agents)
  --global      user-wide dirs instead of the current project
  --dest DIR    override the harness root (implies not --global)

Run from a clone of this pack, or via:
  bash /path/to/beadfinder/install.sh --omp
EOF
  exit 1
}

HARNESS=""
GLOBAL=0
DEST_OVERRIDE=""

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
  fi
  if [[ -d "$src/references" ]]; then
    cp -R "$src/references" "$dest/"
  fi
}

copy_skill beadfinder "$PACK"
copy_skill grill "$PACK/companions/grill"
copy_skill research "$PACK/companions/research"
copy_skill to-spec "$PACK/companions/to-spec"

if [[ "$HARNESS" == "omp" ]]; then
  cp "$PACK/adapters/ohmypi/agents/"*.md "$AGENTS/"
else
  cp "$PACK/adapters/opencode/agents/"*.md "$AGENTS/"
fi

echo "installed to $SKILLS"
echo "agents in   $AGENTS"
echo
echo "in the target repo: bd init  (if needed)"
echo "append AGENTS.md.snippet to that repo's AGENTS.md"
echo "start the wayfinder agent"
