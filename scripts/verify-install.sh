#!/usr/bin/env bash
# verify-install.sh — structural live-verification of install.sh.
#
# For every harness/flag combination (--omp, --opencode, --cline, and each
# with --global, plus --omp --debug and --omp --dest) this script executes install.sh into a
# fresh temp sandbox and asserts the resulting file tree matches what
# README.md / docs/harness-*.md document each harness as loading:
#   --omp           -> .omp/{skills,agents,extensions/beadfinder}
#   --omp --global  -> ~/.omp/agent/{skills,agents,extensions/beadfinder}
#   --opencode      -> .opencode/{skills,agents,plugins,commands}
#   --opencode --global -> ~/.config/opencode/{skills,agents,plugins,commands}
#   --cline         -> .cline/{skills,agents,plugins/beadfinder}
#   --cline --global-> ~/.cline/{skills,agents,plugins/beadfinder}
#
# Verified 2026-09-06 (structural execution into sandboxed temp roots; the
# omp/opencode/cline binaries exist on this machine but were not executed --
# sandbox runs assert trees against the documented load paths above, which
# were cross-checked against README.md and docs/harness-*.md and agree with
# install.sh's --global roots ~/.omp/agent, ~/.cline, ~/.config/opencode).
set -euo pipefail

PACK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL="$PACK/install.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0

# fail LABEL MESSAGE — loud first-failure abort for one run
fail() {
  echo "FAIL [$1] $2" >&2
  exit 1
}

assert_file() { [[ -f "$1" ]] || fail "$RUN" "expected file missing: $1"; }
assert_dir()  { [[ -d "$1" ]] || fail "$RUN" "expected dir missing: $1"; }

# Common assertions: 7 skills, reviewer agent, executable skill scripts.
check_common() {
  local root="$1"
  assert_file "$root/skills/beadfinder/SKILL.md"
  local c
  for c in grill implement review research to-spec to-tickets; do
    assert_file "$root/skills/beadfinder-$c/SKILL.md"
  done
  assert_file "$root/agents/reviewer.md"
  local badsh
  badsh="$(find "$root/skills" -type f -name '*.sh' ! -perm -u+x)"
  [[ -z "$badsh" ]] || fail "$RUN" "non-executable skill scripts:
$badsh"
}

check_omp() {
  local root="$1"
  assert_file "$root/extensions/beadfinder/index.ts"
  assert_dir  "$root/extensions/beadfinder/lib"
  assert_file "$root/extensions/beadfinder/lib/policy.ts"
  assert_file "$root/extensions/beadfinder/lib/engine.ts"
  assert_file "$root/extensions/beadfinder/lib/bd.ts"
  grep -q 'from "./engine.ts"' "$root/extensions/beadfinder/lib/policy.ts" \
    || fail "$RUN" "installed OMP policy.ts still imports core/lib (install rewrite missed)"
  # OMP treats every top-level *.ts under extensions/ as its own entry; the
  # old flattened index.ts/debug.ts strays must not be present.
  local strays
  strays="$(find "$root/extensions" -maxdepth 1 -type f -name '*.ts')"
  [[ -z "$strays" ]] || fail "$RUN" "stray top-level *.ts under extensions/:
$strays"
}

check_opencode() {
  local root="$1"
  assert_file "$root/plugins/beadfinder.ts"
  assert_dir  "$root/plugins/beadfinder"
  assert_file "$root/plugins/beadfinder/lib/policy.ts"
  assert_file "$root/plugins/beadfinder/lib/engine.ts"
  assert_file "$root/plugins/beadfinder/lib/bd.ts"
  grep -q 'from "./engine.ts"' "$root/plugins/beadfinder/lib/policy.ts" \
    || fail "$RUN" "installed OpenCode policy.ts still imports core/lib (install rewrite missed)"
  local tests
  tests="$(find "$root/plugins" -type f -name '*.test.ts')"
  [[ -z "$tests" ]] || fail "$RUN" "*.test.ts leaked into plugins/:
$tests"
  # Source ships commands; installed tree must carry them.
  if compgen -G "$PACK/adapters/opencode/commands/*.md" >/dev/null; then
    [[ -n "$(find "$root/commands" -maxdepth 1 -type f -name '*.md' 2>/dev/null)" ]] \
      || fail "$RUN" "no *.md commands installed under $root/commands"
  fi
}

check_cline() {
  local root="$1"
  assert_file "$root/plugins/beadfinder/index.ts"
  assert_file "$root/plugins/beadfinder/package.json"
  assert_dir  "$root/plugins/beadfinder/lib"
  assert_file "$root/plugins/beadfinder/lib/policy.ts"
  assert_file "$root/plugins/beadfinder/lib/engine.ts"
  assert_file "$root/plugins/beadfinder/lib/bd.ts"
  grep -q 'from "./engine.ts"' "$root/plugins/beadfinder/lib/policy.ts" \
    || fail "$RUN" "installed Cline policy.ts still imports core/lib (install rewrite missed)"
  local tests
  tests="$(find "$root/plugins" -type f -name '*.test.ts')"
  [[ -z "$tests" ]] || fail "$RUN" "*.test.ts leaked into plugins/:
$tests"
}

# run LABEL -- <install.sh args...>
run_case() {
  RUN="$1"; shift
  local global_flag=0 dest_flag=0
  local args=()
  local a
  while [[ $# -gt 0 ]]; do
    a="$1"; shift
    case "$a" in
      --global) global_flag=1 ;;
      --dest)   dest_flag=1 ;;  # override dir is wired to the sandbox below
      *)        args+=("$a") ;;
    esac
  done

  local sandbox="$TMP/${RUN//\//-}"
  mkdir -p "$sandbox"
  if [[ "$global_flag" -eq 1 ]]; then
    args+=(--global)
  fi
  if [[ "$dest_flag" -eq 1 ]]; then
    args+=(--dest "$sandbox/dest")
  fi

  if [[ "$global_flag" -eq 1 ]]; then
    # --global resolves against $HOME; run from a scratch cwd and prove the
    # cwd stays clean (nothing per-project leaks out of a --global run).
    mkdir -p "$sandbox/cwd"
    ( cd "$sandbox/cwd" && HOME="$sandbox" bash "$INSTALL" ${args[@]} ) >/dev/null \
      || fail "$RUN" "install.sh exited nonzero"
    for d in .omp .cline .opencode; do
      [[ ! -e "$sandbox/cwd/$d" ]] || fail "$RUN" "--global leaked $d into cwd"
    done
  else
    # Non-global uses $PWD as the project root.
    ( cd "$sandbox" && HOME="$TMP/fakehome" bash "$INSTALL" ${args[@]} ) >/dev/null \
      || fail "$RUN" "install.sh exited nonzero"
  fi

  case "$RUN" in
    omp)            check_common "$sandbox/.omp";            check_omp      "$sandbox/.omp" ;;
    omp-global)     check_common "$sandbox/.omp/agent";      check_omp      "$sandbox/.omp/agent" ;;
    omp-debug)      check_common "$sandbox/.omp";            check_omp      "$sandbox/.omp"
                    assert_file "$sandbox/.omp/skills/beadfinder-debug/SKILL.md" ;;
    omp-dest)       check_common "$sandbox/dest";            check_omp      "$sandbox/dest" ;;
    opencode)       check_common "$sandbox/.opencode";       check_opencode "$sandbox/.opencode" ;;
    opencode-global) check_common "$sandbox/.config/opencode"; check_opencode "$sandbox/.config/opencode" ;;
    cline)          check_common "$sandbox/.cline";          check_cline    "$sandbox/.cline" ;;
    cline-global)   check_common "$sandbox/.cline";          check_cline    "$sandbox/.cline" ;;
    *) fail "$RUN" "unknown run label" ;;
  esac

  echo "PASS [$RUN]"
  PASS=$((PASS + 1))
}

run_case omp             --omp
run_case opencode        --opencode
run_case cline           --cline
run_case omp-global      --omp --global
run_case opencode-global --opencode --global
run_case cline-global    --cline --global
run_case omp-debug       --omp --debug
# --dest DIR is its own ROOT-resolution branch (install.sh:38-41): install from
# a scratch cwd and prove the tree lands in the override dir, not in $PWD.
run_case omp-dest        --omp --dest

echo
echo "$PASS/8 PASS"
[[ "$PASS" -eq 8 ]] || exit 1
