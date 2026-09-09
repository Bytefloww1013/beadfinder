#!/usr/bin/env bash
# Beadfinder v0.8.0 installer
# Copy beadfinder skills + persona agents into Oh My Pi, OpenCode, or Cline (v0.8.0).
set -euo pipefail

usage() {
  local code="${1:-1}"
  local out=2
  [[ "$code" -eq 0 ]] && out=1
  cat >&$out <<'EOF'
Beadfinder v0.8.0 installer
usage: install.sh --omp|--opencode|--cline [--global] [--dest DIR] [--debug]

  --omp         Oh My Pi  (.omp/skills + .omp/agents + extensions)
  --opencode    OpenCode  (.opencode/skills + .opencode/agents + plugins + commands)
  --cline       Cline     (.cline/skills + .cline/agents + plugins)
  --global      user-wide dirs instead of the current project
  --dest DIR    override the harness root (implies not --global)
  --debug       also install beadfinder-debug (hook log + status advisor)

Run from a clone of this pack, or via:
  bash /path/to/beadfinder/install.sh --omp
  bash /path/to/beadfinder/install.sh --omp --debug
  bash /path/to/beadfinder/install.sh --opencode
  bash /path/to/beadfinder/install.sh --opencode --debug
  bash /path/to/beadfinder/install.sh --cline
  bash /path/to/beadfinder/install.sh --cline --debug
EOF
  exit "$code"
}

HARNESS=""
GLOBAL=0
DEST_OVERRIDE=""
DEBUG=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --omp|--oh-my-pi|--ohmypi) HARNESS="omp" ;;
    --opencode) HARNESS="opencode" ;;
    --cline) HARNESS="cline" ;;
    --global|-g) GLOBAL=1 ;;
    --dest)
      DEST_OVERRIDE="${2:-}"
      [[ -n "$DEST_OVERRIDE" ]] || usage
      shift
      ;;
    --debug) DEBUG=1 ;;
    -h|--help) usage 0 ;;
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
elif [[ "$HARNESS" == "cline" ]]; then
  if [[ "$GLOBAL" -eq 1 ]]; then
    ROOT="${HOME}/.cline"
  else
    ROOT="${PWD}/.cline"
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
    # Explicitly recognize, verify, and chmod +x scripts/test-run.sh during skill script copying
    if [[ -f "$dest/scripts/test-run.sh" ]]; then
      chmod a+x "$dest/scripts/test-run.sh"
      [[ -x "$dest/scripts/test-run.sh" ]] || {
        echo "error: failed to make $dest/scripts/test-run.sh executable" >&2
        exit 1
      }
    fi
  fi
  if [[ -d "$src/references" ]]; then
    cp -R "$src/references" "$dest/"
  fi
}

copy_skill beadfinder "$PACK"
# Verify scripts/test-run.sh is explicitly installed and executable in beadfinder skill
if [[ ! -f "$SKILLS/beadfinder/scripts/test-run.sh" ]]; then
  echo "error: scripts/test-run.sh missing from $SKILLS/beadfinder/scripts/" >&2
  exit 1
fi
chmod a+x "$SKILLS/beadfinder/scripts/test-run.sh"
[[ -x "$SKILLS/beadfinder/scripts/test-run.sh" ]] || {
  echo "error: $SKILLS/beadfinder/scripts/test-run.sh is not executable" >&2
  exit 1
}
copy_skill beadfinder-grill "$PACK/companions/beadfinder-grill"
copy_skill beadfinder-implement "$PACK/companions/beadfinder-implement"
copy_skill beadfinder-review "$PACK/companions/beadfinder-review"
copy_skill beadfinder-research "$PACK/companions/beadfinder-research"
copy_skill beadfinder-to-spec "$PACK/companions/beadfinder-to-spec"
copy_skill beadfinder-to-tickets "$PACK/companions/beadfinder-to-tickets"

if [[ "$DEBUG" -eq 1 ]]; then
  copy_skill beadfinder-debug "$PACK/companions/beadfinder-debug"
  mkdir -p "$SKILLS/beadfinder/scripts"
  cp "$PACK/scripts/debug-log.py" "$SKILLS/beadfinder/scripts/"
fi

# session-boot.sh calls frontier.sh by path; 100644 copies fail with Permission denied
find "$SKILLS" -type f -name '*.sh' -exec chmod a+x {} +
[[ -x "$SKILLS/beadfinder/scripts/test-run.sh" ]] || {
  echo "error: $SKILLS/beadfinder/scripts/test-run.sh is not executable" >&2
  exit 1
}

# Shared engine lives once in core/lib. Adapters are shims that import it via
# ../../../../../core/lib/*. Harnesses load raw TS from the plugin folder, so
# install copies core/lib next to the shim and rewrites those imports to "./".
CORE_LIB_FILES=(bd.ts engine.ts fsutil.ts log.ts paths.ts policy-core.ts state.ts tools-core.ts)

install_plugin_lib() {
  local dest_lib="$1"
  local src_shim="$2"
  mkdir -p "$dest_lib"
  local f
  for f in "${CORE_LIB_FILES[@]}"; do
    cp "$PACK/core/lib/$f" "$dest_lib/$f"
  done
  cp "$src_shim/policy.ts" "$dest_lib/policy.ts"
  cp "$src_shim/tools.ts" "$dest_lib/tools.ts"
  if [[ -f "$src_shim/debug.ts" ]]; then
    cp "$src_shim/debug.ts" "$dest_lib/debug.ts"
  fi
  python3 - "$dest_lib" <<'PY'
import pathlib, re, sys
lib = pathlib.Path(sys.argv[1])
pat = re.compile(r'(from\s+")(?:\.\./)+core/lib/([^"]+)(")')
for path in lib.glob("*.ts"):
    text = path.read_text()
    new = pat.sub(r"\1./\2\3", text)
    if new != text:
        path.write_text(new)
PY
}

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
  cp "$PACK/adapters/ohmypi/extensions/beadfinder/index.ts" "$EXT/"
  install_plugin_lib "$EXT/lib" "$PACK/adapters/ohmypi/extensions/beadfinder/lib"
  echo "extensions in $EXT"
  echo "only $EXT/index.ts is the OMP entry; helpers stay in $EXT/lib/"
  echo "if hooks do not fire, set .omp/settings.json to:"
  echo '  { "extensions": [".omp/extensions/beadfinder"] }'
elif [[ "$HARNESS" == "cline" ]]; then
  cp "$PACK/adapters/cline/agents/"*.md "$AGENTS/"
  cp "$PACK/adapters/cline/agents/"*.yaml "$AGENTS/"
  PLUGIN_ROOT="$ROOT/plugins"
  DEST_PLUGIN="$PLUGIN_ROOT/beadfinder"
  mkdir -p "$DEST_PLUGIN"
  rm -rf "$DEST_PLUGIN/lib"
  cp "$PACK/adapters/cline/plugins/beadfinder/package.json" "$DEST_PLUGIN/"
  cp "$PACK/adapters/cline/plugins/beadfinder/index.ts" "$DEST_PLUGIN/"
  install_plugin_lib "$DEST_PLUGIN/lib" "$PACK/adapters/cline/plugins/beadfinder/lib"
  echo "plugin in  $DEST_PLUGIN"
  echo "Cline loads plugins from .cline/plugins (or ~/.cline/plugins with --global)"
  echo "kill switch: BEADFINDER_HOOKS=off"
else
  cp "$PACK/adapters/opencode/agents/"*.md "$AGENTS/"
  # OpenCode auto-loads only {plugin,plugins}/*.{ts,js}. The entry must be a
  # top-level file; helpers stay in plugins/beadfinder/lib so they are not
  # treated as extra plugin modules.
  PLUGIN_ROOT="$ROOT/plugins"
  mkdir -p "$PLUGIN_ROOT"
  rm -f "$PLUGIN_ROOT/beadfinder.ts"
  rm -rf "$PLUGIN_ROOT/beadfinder"
  cp "$PACK/adapters/opencode/plugins/beadfinder.ts" "$PLUGIN_ROOT/beadfinder.ts"
  install_plugin_lib "$PLUGIN_ROOT/beadfinder/lib" "$PACK/adapters/opencode/plugins/beadfinder/lib"
  echo "plugin in  $PLUGIN_ROOT/beadfinder.ts"
  echo "OpenCode loads .opencode/plugins/*.ts (or ~/.config/opencode/plugins with --global)"
  echo "kill switch: BEADFINDER_HOOKS=off"

  CMD_SRC="$PACK/adapters/opencode/commands"
  if [[ -d "$CMD_SRC" ]]; then
    COMMANDS="$ROOT/commands"
    mkdir -p "$COMMANDS"
    cp "$CMD_SRC/"*.md "$COMMANDS/"
    echo "commands in $COMMANDS"
  fi
fi

echo "installed to $SKILLS"
echo "agents in   $AGENTS"
if [[ "$DEBUG" -eq 1 ]]; then
  if [[ "$HARNESS" == "cline" ]]; then
    echo "debug skill on; log file will be <target-repo>/.cline/beadfinder-debug.log"
  elif [[ "$HARNESS" == "opencode" ]]; then
    echo "debug skill on; log file will be <target-repo>/.opencode/beadfinder-debug.log"
  else
    echo "debug skill on; log file will be <target-repo>/.omp/beadfinder-debug.log"
  fi
fi
echo
echo "in the target repo: bd init  (if needed)"
echo "start the wayfinder agent"
