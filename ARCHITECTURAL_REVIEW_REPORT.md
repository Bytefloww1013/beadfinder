# Systems Architecture Analysis & Comprehensive Repository Review: Beadfinder (v0.7.0)

**Evaluation Team**: Systems Architecture Analyst (Lead), QA Reliability Engineers, Senior Software Engineers, Technical Documentation Writers, and Agentic Workflow Specialists.  
**Repository**: `Bytefloww1013/beadfinder`  
**Target Systems**: Oh My Pi (`omp`), OpenCode (`opencode`), and Cline (`cline`) Agent Harnesses  
**Baseline Test Execution**: `verify-review-flow.sh` (12 assertions pass), OpenCode test suite (33 tests pass), Cline test suite (38 tests pass).

---

## Executive Summary

`beadfinder` is a domain-specific agentic wayfinding and execution harness designed to operate atop the Beads (`bd`) issue tracking engine. Its architectural proposition is significant: solve multi-session agent drift, context degradation, and hallucinated task completion by structuring engineering initiatives into a strict 5-phase finite state machine (FSM):
$$\text{Plan} \xrightarrow{G_0} \text{Requirements} \xrightarrow{G_1} \text{Design} \xrightarrow{G_2} \text{Implement} \underset{\text{fail}}{\overset{\text{submit}}{\rightleftharpoons}} \text{Review} \xrightarrow{\text{pass}} \text{Closed}$$

The repository exhibits strong architectural discipline:
1. **Separation of Policy and Harness**: Deterministic shell scripts and TypeScript event hooks enforce invariants that LLM system prompts cannot talk themselves out of.
2. **Atomic State Transitions**: Utilizing `bd ready --claim` prevents double-claiming race conditions across concurrent subagents.
3. **Evidence-Anchored Quality Gauntlet**: The review loop requires deterministic test execution evidence and multi-dimensional rubric scoring ($\ge 8/10$) before tickets can be closed.

However, a thorough forensic analysis across architectural soundness, code quality, harness portability, and file synchronization reveals multiple critical flaws, logic vulnerabilities, code duplication, and documentation drift. This report provides deep critiques and actionable remediation steps with production-ready code replacements.

---

## Evaluation Matrix

| Category | Rating (1–10) | Primary Strengths | Primary Weaknesses / Risks |
| :--- | :---: | :--- | :--- |
| **1. Architecture & FSM Integrity** | **8.5** | Clean 5-phase relay, robust DAG decoupling, write walls per persona. | Review close-guard score validation lacks upper-bound and threshold checks; OMP adapter lacks multi-session state isolation. |
| **2. Code Quality & Implementation** | **7.5** | Strong POSIX shell idioms, comprehensive test assertions for Cline/OpenCode plugins. | Regex fragility on CLI flag parsing, unbounded score checks (`999/10`), hardcoded child process handling differences. |
| **3. Project Structure & Code Reuse** | **6.5** | Intuitive directory structure (`scripts/`, `agents/`, `adapters/`, `companions/`). | **Massive code duplication**: ~90% identical TypeScript hook logic duplicated across 3 adapters without a shared core library. |
| **4. Harness Portability & Adapters** | **7.5** | Tailored integrations for Oh My Pi, OpenCode, and Cline. | Typos in documentation filenames (`harness-ohmyi.md`), behavioral discrepancy in reviewer agent contracts across harnesses. |
| **5. Workflow & Human-in-the-Loop** | **8.5** | Clear HITL affinity rules, spawn contract enforcement, anti-fog mechanisms. | Inconsistent fail-verdict syntax across agent markdown prompts, potential state staleness in long-lived sessions. |
| **6. Documentation & Specifications** | **7.5** | Exhaustive architecture diagrams, clear rubric anchors, clean changelog. | Residual status drift (`STATUS.json`), outdated companion version (`beadfinder-debug` at `0.5.0`), typographical discrepancies. |

---

## 1. Architecture & State Machine Analysis

### 1.1 Finite State Machine & Gate Enforcement
The 5-phase pipeline transitions tickets via explicit labels (`phase:plan`, `phase:requirements`, `phase:design`, `phase:implement`, `phase:review`).
- **Gate $G_0$ (Plan Exit)**: Plan epic has zero open ready beads (`bd ready --label phase:plan`).
- **Gate $G_1$ (Requirements Exit)**: Zero open beads under map epic and requirements slice; `/beadfinder-to-spec` outputs `SPEC.md`.
- **Gate $G_2$ (Design Exit)**: Zero open design beads; `ARCHITECTURE.md` + `IMPLEMENTATION.md` written; ticket DAG cut via `/beadfinder-to-tickets`.
- **Gate $T_1 \to T_3$ (Build & Review Loop)**: Handled exclusively via `scripts/review-submit.sh` and `scripts/review-verdict.sh`.

#### Vulnerability Found: Weak Enforcement in `bd close` Policy Hook
In `scripts/review-verdict.sh`, the $\ge 8/10$ rubric score threshold is strictly enforced:
```bash
# scripts/review-verdict.sh:88-97
if [[ "$val" -lt 8 ]]; then
  below="${below:+$below, }$dim $val/10"
fi
```
However, in the TypeScript hook layer (`policy.ts` across `adapters/cline/plugins/beadfinder/lib/policy.ts`, `adapters/opencode/plugins/beadfinder/lib/policy.ts`, and `adapters/ohmypi/extensions/beadfinder/lib/policy.ts`), the hook validation for `bd close` only validates the regex token `Review PASS` and that 3 score patterns exist:
```typescript
// adapters/cline/plugins/beadfinder/lib/policy.ts:376-384
const reason = flagValue(bd, "--reason") || flagValue(bd, "-r");
const scores = reason.match(/(\d+)\s*\/\s*10/g) || [];
if (!/Review PASS/i.test(reason) || scores.length < 3) {
  throwBlock(
    cwd,
    "bd-close-guard",
    "Reviewer close reason must record all three scores: quality, correctness, pillars (e.g. Review PASS: quality 9/10, correctness 8/10, pillars 9/10.).",
  );
}
```
**Impact**: If a reviewer agent invokes `bd close <id> --reason "Review PASS: quality 2/10, correctness 3/10, pillars 4/10."` directly instead of running `scripts/review-verdict.sh`, the hook **permits** the close! Furthermore, values like `999/10` or `-1/10` pass the hook check.

### 1.2 State Isolation: Session vs. Global Concurrency
In `adapters/opencode/plugins/beadfinder/lib/state.ts` and `adapters/cline/plugins/beadfinder/lib/state.ts`, session state is stored per session:
```typescript
export type Store = {
  sessions: Record<string, SessionState>;
};
```
However, in `adapters/ohmypi/extensions/beadfinder/lib/state.ts`, the store is **flat and global**:
```typescript
export function loadState(cwd: string): SessionState {
  return { ...emptyState(), ...readJson(statePath(cwd), emptyState()) };
}
export function saveState(cwd: string, state: SessionState): void {
  writeJson(statePath(cwd), state);
}
```
**Impact**: If two concurrent Oh My Pi sessions run (e.g. an architect and a background research worker), they overwrite each other's `claimedId`, `mode`, and `persona` in `.omp/beadfinder/state.json`.

---

## 2. Code Quality & Implementation Critiques

### 2.1 Issue: Unbounded and Unchecked Scores in `scripts/review-verdict.sh`
In `scripts/review-verdict.sh`:
```bash
val="$(grep -oiE "${pat}[^0-9]*[0-9]+" <<<"$REASON" | grep -oE '[0-9]+' | head -1)"
val=$((10#${val:-0}))
if [[ "$val" -lt 8 ]]; then
  below="${below:+$below, }$dim $val/10"
fi
```
**Critique**:
1. If a reason contains `quality 999/10`, `val` is evaluated as `999`. Because `999 >= 8`, it passes.
2. The regex matches any arbitrary integer without bounding $8 \le \text{val} \le 10$.
3. When matching `quality`, if the reason contains `quality: 10/10`, `grep -oiE "${pat}[^0-9]*[0-9]+"` captures `quality: 10`. But if formatted as `high quality work: 5 bugs, score 9/10`, it might capture `5` instead of `9`.

### 2.2 Issue: Fragile Tokenizer and Flag Value Parsing in TypeScript
In `tools.ts` across all adapters:
```typescript
export function flagValue(tokens: string[], flag: string): string {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === flag) return tokens[i + 1] || "";
    if (t.startsWith(flag + "=")) return t.slice(flag.length + 1);
  }
  return "";
}
```
**Critique**:
If an argument contains quotes or spaces (e.g. `--reason "Review PASS: quality 9/10..."`), the tokenizer in `tools.ts` splits by naive regex or whitespace:
```typescript
export function tokenize(cmd: string): string[] {
  const out: string[] = [];
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cmd))) {
    out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  }
  return out;
}
```
While `tokenize` strips outer quotes, if a command is `bd close id --reason "quality 9/10"`, `flagValue(tokens, "--reason")` receives `quality 9/10`. However, inside `policy.ts`:
```typescript
const scores = reason.match(/(\d+)\s*\/\s*10/g) || [];
```
If `--reason` is passed as `--reason="Review PASS: quality 9/10..."`, `t.startsWith(flag + "=")` returns the raw unstripped string including nested quotes if improperly tokenized.

### 2.3 Issue: Shell Invariant Assumptions in `install.sh`
In `install.sh`:
```bash
if [[ "$GLOBAL" -eq 1 ]]; then
  ROOT="${HOME}/.omp/agent"
```
For Oh My Pi, global extensions usually expect `~/.omp/extensions`, not `~/.omp/agent/extensions`. In line 118:
```bash
cp -R "$PACK/adapters/ohmypi/extensions/beadfinder/." "$EXT/"
```
When `$GLOBAL` is true, `$EXT` evaluates to `${HOME}/.omp/agent/extensions/beadfinder`. If the Oh My Pi daemon looks at `${HOME}/.omp/extensions/beadfinder`, the extension will silently fail to load.

---

## 3. Project Structure & Code Duplication

### 3.1 The Three-Fork Drift (`adapters/{omp, opencode, cline}`)
A file comparison reveals extreme code duplication:
- `adapters/opencode/plugins/beadfinder/lib/`
- `adapters/cline/plugins/beadfinder/lib/`
- `adapters/ohmypi/extensions/beadfinder/lib/`

Each directory contains near-identical implementations of:
- `bd.ts` (~240 lines each)
- `paths.ts` (~115 lines each)
- `tools.ts` (~160 lines each)
- `log.ts` (~60 lines each)
- `policy.ts` (~670 lines each)

#### Evidence of Divergence / Bugs Introduced by Duplication:
1. **Patch Parser Discrepancy**:
   `adapters/cline/plugins/beadfinder/lib/tools.ts` includes a fallback git diff header regex parser:
   ```typescript
   if (out.length === 0) {
     const diffRe = /^(?:---|\+\+\+)\s+[ab]\/(.+)$/gm;
     while ((m = diffRe.exec(patchText))) {
       const p = (m[1] || "").trim();
       if (p && !out.includes(p)) out.push(p);
     }
   }
   ```
   This critical fix is **missing** from `adapters/opencode/plugins/beadfinder/lib/tools.ts` and `adapters/ohmypi/extensions/beadfinder/lib/tools.ts`! As a result, unified diffs applied in OpenCode or Oh My Pi bypass product write detection if they omit index markers.

2. **Tool Name Classification Gap**:
   In Cline's `tools.ts`, `READ_TOOLS` contains `read_file`, `read_files`, `open_file`. In OpenCode's `tools.ts`, `READ_TOOLS` only contains `read`. If OpenCode introduces tool aliases or custom commands, the path walls will fail to inspect them.

3. **Missing Test Coverage for Oh My Pi**:
   While `adapters/opencode` has 33 tests and `adapters/cline` has 38 tests, `adapters/ohmypi` has **zero test files** (`0 pass`).

---

## 4. Workflow & Agent Contract Analysis

### 4.1 Inconsistent Reviewer Agent Prompt Instructions
Compare the instructions given to the Reviewer persona across files:

- **`agents/reviewer.md` (Canonical)**:
  ```markdown
  On fail run `scripts/review-verdict.sh <id> --fail --reason "<scores + ranked issues>"` — the script posts your reason as the FAIL comment; do not post it yourself.
  ```

- **`adapters/opencode/agents/reviewer.md`**:
  ```markdown
  Close only on pass with the three scores in the reason; on fail post ranked issues and run `scripts/review-verdict.sh <id> --fail`.
  ```

- **`adapters/ohmypi/agents/reviewer.md`**:
  ```markdown
  Close only on pass with the three scores in the reason; on fail post ranked issues and run `scripts/review-verdict.sh <id> --fail`.
  ```

- **`adapters/cline/agents/reviewer.md`**:
  ```markdown
  Close only on pass with the three scores in the reason; on fail post ranked issues and run `scripts/review-verdict.sh <id> --fail --reason "<scores + ranked issues>"`.
  ```

**Critique**:
In `adapters/opencode` and `adapters/ohmypi`, the prompt instructs the agent to:
1. "post ranked issues" (manually via `bd comment`), AND THEN
2. run `scripts/review-verdict.sh <id> --fail` (omitting `--reason`).

However, `scripts/review-verdict.sh` lines 38-41 state:
```bash
if [[ -z "$REASON" ]]; then
  echo '{"error":"empty --reason"}' >&2
  exit 1
fi
```
If an OpenCode or Oh My Pi agent follows its system prompt literally, it runs `scripts/review-verdict.sh <id> --fail` without `--reason`, and the script **crashes with exit code 1** (`{"error":"empty --reason"}`)!

### 4.2 Inconsistent Wayfinder Frontmatter & Permissions
In `adapters/ohmypi/agents/wayfinder.md`:
```yaml
spawns: architect,implementer,reviewer,product,research
```
In `adapters/opencode/agents/wayfinder.md`:
```yaml
permission:
  task:
    "*": deny
    architect: allow
    implementer: allow
    reviewer: allow
    product: allow
    research: allow
```
In `adapters/cline/agents/wayfinder.yaml`:
```yaml
tools:
  - execute_command
  - run_commands
  - read_files
  - search_codebase
  - ask_question
  - spawn_agent
```
The permission matrices are syntactically aligned with their respective harnesses, which is well engineered. However, the system prompts inside `adapters/opencode/agents/wayfinder.md` versus `agents/wayfinder.md` have slight wording drifts regarding the exact invocation of `session-boot.sh`.

---

## 5. Documentation & Metadata Audit

### 5.1 Typo in File Name: `docs/harness-ohmyi.md`
The file is named `docs/harness-ohmyi.md` (missing the `p` in `ohmypi`).
- References in `ARCHITECTURE.md` (line 153) refer to `harness-*.md`.
- `README.md` and `docs/HOOKS.md` do not directly link to it, but standard conventions demand `docs/harness-ohmypi.md`.

### 5.2 Outdated Version in `companions/beadfinder-debug/SKILL.md`
In `companions/beadfinder-debug/SKILL.md`:
```yaml
metadata:
  version: "0.5.0"
  tracker: beads
  debug: true
```
All other companion skills (`beadfinder-grill`, `beadfinder-implement`, `beadfinder-research`, `beadfinder-review`, `beadfinder-to-spec`, `beadfinder-to-tickets`) are synchronized at `0.7.0`. While `docs/STATUS.json` mentions `"beadfinder-debug companion remains 0.5.0 (untouched by design)"`, keeping a legacy version creates ambiguity for automated package auditors and installation scripts.

### 5.3 Stale / Unbounded Notes in `docs/STATUS.json`
`docs/STATUS.json` line 11:
```json
"notes": "... remaining nit: unbounded 999/10 accepted (review-verdict.sh:85), ride next scripts bead"
```
Line 61:
```json
"residual_nits": [
  "review-verdict.sh accepts unbounded scores (999/10) — bounded-below only",
  ...
]
```
This is documented as a known debt item. It has not yet been resolved in code.

---

## 6. Actionable Recommendations & Code Solutions

Below are actionable solutions and complete code snippets for the next agent or engineer to apply.

---

### Remediation Item 1: Bound Scores and Validate Ranges in `scripts/review-verdict.sh`

#### Problem
`scripts/review-verdict.sh` accepts unbounded integers ($\ge 8$), allowing values like `999/10`, and uses loose regex extraction that can confuse counts of issues with rubric scores.

#### Solution
Enforce strictly that each dimension has an explicit score $S \in [1, 10]$, that all three are $\ge 8$ and $\le 10$ for `--pass`, and produce clean JSON errors on violation.

```bash
# In scripts/review-verdict.sh, replace lines 76-102 with:

if [[ -n "$PASS" ]]; then
  if ! grep -qi "Review PASS" <<<"$REASON"; then
    echo '{"error":"--pass reason must contain \"Review PASS\"","id":"'"$ID"'"}' >&2
    exit 1
  fi

  below=""
  invalid=""
  for dim in quality correctness pillars; do
    pat="$dim"
    [[ "$dim" == "pillars" ]] && pat="pillars?"
    
    # Match pattern like: 'quality: 9/10' or 'quality 8 / 10'
    score_token="$(grep -oiE "${pat}[^0-9]*[0-9]+\s*/\s*10" <<<"$REASON" | head -1)"
    if [[ -z "$score_token" ]]; then
      echo '{"error":"--pass reason missing required rubric score for '"$dim"' (expected: '"$dim"' N/10)","id":"'"$ID"'"}' >&2
      exit 1
    fi

    val="$(grep -oE '[0-9]+' <<<"$score_token" | head -1)"
    val=$((10#${val:-0}))

    if [[ "$val" -lt 1 || "$val" -gt 10 ]]; then
      invalid="${invalid:+$invalid, }$dim $val/10"
    elif [[ "$val" -lt 8 ]]; then
      below="${below:+$below, }$dim $val/10"
    fi
  done

  if [[ -n "$invalid" ]]; then
    echo '{"error":"--pass rejected: rubric scores out of bounds [1-10]: '"$invalid"'","id":"'"$ID"'"}' >&2
    exit 1
  fi

  if [[ -n "$below" ]]; then
    echo '{"error":"--pass rejected: rubric scores below the pass bar (>= 8): '"$below"'","id":"'"$ID"'"}' >&2
    exit 1
  fi

  bd close "$ID" --reason "$REASON" --json
  exit 0
fi
```

---

### Remediation Item 2: Align `bd close` Hook Policy with Rubric Thresholds

#### Problem
In `policy.ts`, the hook allows closing review beads even if scores are below 8, provided the text contains `Review PASS` and three numbers.

#### Solution
Enhance the close-guard in `policy.ts` across `adapters/cline`, `adapters/opencode`, and `adapters/ohmypi` to inspect the integer scores and enforce that all three are $\ge 8$ and $\le 10$.

```typescript
// Add helper to adapters/*/lib/bd.ts (or policy.ts):
export function parseRubricScores(text: string): { quality?: number; correctness?: number; pillars?: number } {
  const parseDim = (dimPat: string): number | undefined => {
    const re = new RegExp(`${dimPat}[^0-9]*([0-9]+)\\s*\\/\\s*10`, "i");
    const m = text.match(re);
    if (!m) return undefined;
    const n = parseInt(m[1], 10);
    return isNaN(n) ? undefined : n;
  };

  return {
    quality: parseDim("quality"),
    correctness: parseDim("correctness"),
    pillars: parseDim("pillars?"),
  };
}

// In policy.ts under if (st.persona === "reviewer" && inReview):
if (st.persona === "reviewer" && inReview) {
  const reason = flagValue(bd, "--reason") || flagValue(bd, "-r");
  if (!/Review PASS/i.test(reason)) {
    throwBlock(cwd, "bd-close-guard", 'Reviewer close reason must state "Review PASS".');
  }

  const parsed = parseRubricScores(reason);
  if (parsed.quality === undefined || parsed.correctness === undefined || parsed.pillars === undefined) {
    throwBlock(
      cwd,
      "bd-close-guard",
      "Reviewer close reason must record all three scores in N/10 format: quality, correctness, pillars (e.g. Review PASS: quality 9/10, correctness 8/10, pillars 9/10.)."
    );
  }

  const { quality, correctness, pillars } = parsed;
  const invalid = [
    quality < 1 || quality > 10 ? `quality ${quality}/10` : "",
    correctness < 1 || correctness > 10 ? `correctness ${correctness}/10` : "",
    pillars < 1 || pillars > 10 ? `pillars ${pillars}/10` : "",
  ].filter(Boolean);

  if (invalid.length > 0) {
    throwBlock(cwd, "bd-close-guard", `Rubric scores out of bounds [1-10]: ${invalid.join(", ")}`);
  }

  const below = [
    quality < 8 ? `quality ${quality}/10` : "",
    correctness < 8 ? `correctness ${correctness}/10` : "",
    pillars < 8 ? `pillars ${pillars}/10` : "",
  ].filter(Boolean);

  if (below.length > 0) {
    throwBlock(cwd, "bd-close-guard", `Scores below pass bar (>= 8): ${below.join(", ")}`);
  }
}
```

---

### Remediation Item 3: Fix Broken Reviewer Prompts Across Adapters

#### Problem
`adapters/opencode/agents/reviewer.md` and `adapters/ohmypi/agents/reviewer.md` tell the model:
`on fail post ranked issues and run scripts/review-verdict.sh <id> --fail`
(omitting `--reason`), which causes the script to exit 1 with `{"error":"empty --reason"}` and violates the single-post rule.

#### Solution
Align both files with `agents/reviewer.md` and `adapters/cline/agents/reviewer.md`:

```markdown
<!-- adapters/opencode/agents/reviewer.md and adapters/ohmypi/agents/reviewer.md line 11 -->
You are the reviewer. One ticket. Claim it. Read the related builds and the diff. Score quality, correctness, pillar adherence each 1–10 per the rubric in `references/review-rubric.md`; pass = all ≥ 8. Verify evidence yourself (run the tests, inspect screenshots or console output) — no evidence, no score. Close only on pass with the three scores in the reason. On fail run `scripts/review-verdict.sh <id> --fail --reason "<scores + ranked issues>"` — the script posts your reason as the FAIL comment; do not post it yourself. Do not patch product files (hooks will refuse writes and edits into src).
```

---

### Remediation Item 4: Sync Tool Classification and Unified Diff Headers

#### Problem
`adapters/cline/plugins/beadfinder/lib/tools.ts` has support for `--- a/file` and `+++ b/file` diff header extraction, but `adapters/opencode` and `adapters/ohmypi` lack it.

#### Solution
Extract the diff header parser to the other two adapters:

```typescript
// In adapters/opencode/.../tools.ts and adapters/ohmypi/.../tools.ts inside applyPatchPaths:
export function applyPatchPaths(patchText: string): string[] {
  const out: string[] = [];
  const re = /^\s*[*+-]\s+(?:add|update|delete|move)\s+([^\s:]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(patchText))) {
    const p = (m[1] || "").trim();
    if (p) out.push(p);
  }
  if (out.length === 0) {
    const diffRe = /^(?:---|\+\+\+)\s+[ab]\/(.+)$/gm;
    while ((m = diffRe.exec(patchText))) {
      const p = (m[1] || "").trim();
      if (p && !out.includes(p)) out.push(p);
    }
  }
  return out;
}
```

---

### Remediation Item 5: Unify Adapter Logic via Shared Core Symlink or Package

#### Problem
Triple maintenance of `adapters/{omp, opencode, cline}/.../lib` guarantees drift over time.

#### Recommended Structural Architecture
Create `core/lib/` at repo root:
```
core/lib/
  bd.ts
  fsutil.ts
  log.ts
  paths.ts
  policy.ts
  state.ts
  tools.ts
```
Let each adapter import or copy from `core/lib/` during `install.sh`, or maintain adapter-specific entry points that import standard TypeScript files from `core/`.

---

### Remediation Item 6: Housekeeping & Typos

1. **Rename** `docs/harness-ohmyi.md` $\to$ `docs/harness-ohmypi.md`.
2. **Update** `companions/beadfinder-debug/SKILL.md` version tag from `0.5.0` to `0.7.0`.
3. **Verify** test suite for smoke review flow with out-of-bounds assertions:
   In `scripts/verify-review-flow.sh`, add assertions testing score rejections for `999/10` and `0/10`:
   ```bash
   if in_scratch bash "$SCRIPT_DIR/review-verdict.sh" "$BEAD" --pass --reason "Review PASS: quality 999/10, correctness 9/10, pillars 9/10" >/dev/null 2>&1; then
     die "step g: review-verdict.sh --pass accepted an out-of-bounds score (999/10)"
   fi
   ok
   ```

---

## 7. Hand-Off & Execution Roadmap for the Next Agent

When assigning an implementation agent to execute these repairs, structure the micro-tickets using the following execution sequence:

1. **Ticket 1 (`scripts-bound-scores`)**:
   - Edit `scripts/review-verdict.sh` to enforce score bounds $[1, 10]$ and exact token parsing.
   - Update `scripts/verify-review-flow.sh` with test assertions for out-of-bounds scores.
   - Verify: `bash scripts/verify-review-flow.sh` passes all assertions.

2. **Ticket 2 (`policy-close-guard-sync`)**:
   - Implement `parseRubricScores` in `adapters/cline/plugins/beadfinder/lib/policy.ts` and `adapters/opencode/plugins/beadfinder/lib/policy.ts`.
   - Update `policy.test.ts` to assert that `bd close` with scores $< 8$ or $> 10$ is blocked by the close guard.
   - Run `bun test` in both adapter directories to ensure 100% green suites.

3. **Ticket 3 (`patch-diff-sync`)**:
   - Port the unified diff header extraction from `adapters/cline/.../tools.ts` into `adapters/opencode/.../tools.ts` and `adapters/ohmypi/.../tools.ts`.
   - Add test case in `adapters/opencode/.../tools.test.ts`.

4. **Ticket 4 (`agent-prompt-alignment`)**:
   - Align `adapters/opencode/agents/reviewer.md` and `adapters/ohmypi/agents/reviewer.md` system prompts with canonical `agents/reviewer.md`.
   - Ensure the `--reason` argument is mandatory in the fail verdict command.

5. **Ticket 5 (`docs-and-nits`)**:
   - Rename `docs/harness-ohmyi.md` to `docs/harness-ohmypi.md`.
   - Update `companions/beadfinder-debug/SKILL.md` version to `0.7.0`.
   - Update `docs/STATUS.json` residual nits ledger once tickets 1–4 are committed.

---
*Report compiled and verified against commit `286df13` in `/home/josh/.treehouse/beadfinder-18fb33/2/beadfinder`.*

---

# ADDENDUM — Post-Fix Resolution Audit (2026-09-06)

A team of implementer and reviewer agents executed the remediation roadmap in §7. Every fix was independently verified by adversarial reviewers (all scores ≥ 8/10 per `references/review-rubric.md`) and by re-running the full verification suite.

## Verification gates (all green)

| Gate | Result |
|---|---|
| `bash scripts/verify-review-flow.sh` | **PASS — 15 assertions** (was 12; +3 out-of-bounds rejections: 999/10, 11/10, 0/10) |
| `bun test adapters/cline/plugins/beadfinder/lib/` | **40 pass, 0 fail** (was 38; +2 close-guard rejection tests) |
| `bun test adapters/opencode/plugins/beadfinder/lib/` | **36 pass, 0 fail** (was 33; +1 diff-header test, +2 close-guard tests) |
| `python3 -m json.tool docs/STATUS.json` | valid |

## Critique-by-critique resolution status

| # | Original Critique | Status | Evidence |
|---|---|---|---|
| 1 | Unbounded scores (`999/10`) accepted by `scripts/review-verdict.sh` | **RESOLVED** | Bounds [1,10] + pass bar ≥ 8 enforced; exact dimension-token regexes (`(^|[^a-zA-Z0-9])<dim>…/10`); 3 new assertions in `scripts/verify-review-flow.sh` |
| 2 | `bd close` hook policy allowed any 3 `N/10` tokens (even `quality 2/10`) | **RESOLVED** | `parseRubricScores()` helper added to `policy.ts` in all three adapters (cline:80, opencode:77, ohmypi:59); close-guard rejects missing dims, out-of-bounds, and below-bar scores; tested in both suites |
| 3 | OpenCode/OMP reviewer prompts caused `review-verdict.sh --fail` to crash (`empty --reason`) and invited double-posting | **RESOLVED** | All four adapter prompts (`opencode`, `ohmypi`, `cline` `.md` + `.yaml`) aligned to canonical `agents/reviewer.md` contract: `--fail --reason "<scores + ranked issues>"`; `grep "post ranked issues"` = 0 hits |
| 4 | Unified-diff header parser missing in OpenCode/OMP `tools.ts` | **RESOLVED** | Fallback added to `adapters/opencode/.../tools.ts`; full `applyPatchPaths` added to `adapters/ohmypi/.../tools.ts` (it never had one); new dedupe test in opencode suite |
| 5 | `docs/harness-ohmyi.md` filename typo | **RESOLVED** | `git mv docs/harness-ohmyi.md docs/harness-ohmypi.md`; zero dangling references (the sole remaining string is the rename record in `docs/STATUS.json` `post_review_fixes`) |
| 6 | `beadfinder-debug` companion stuck at 0.5.0 | **RESOLVED** | `companions/beadfinder-debug/SKILL.md:5` → `version: "0.7.0"` |
| 7 | Stale nit ledger in `docs/STATUS.json` | **RESOLVED** | Fixed nits pruned from `modules.scripts.notes` and `final_gate.residual_nits`; `post_review_fixes[]` added; all other fields byte-identical (verified programmatically) |
| 8 | OMP adapter lacks per-session state isolation (`state.ts` flat store) | **OPEN — not ticketed** | Architectural change deferred; requires OMP session-ID plumbing in `HookAPI` |
| 9 | Three-fork duplication of adapter `lib/` code | **OPEN — not ticketed** | Parity syncs reduce drift, but the shared `core/lib/` consolidation (§3.1, Remediation 5) remains future work |
| 10 | Tokenizer/flag-parsing fragility in `tools.ts` | **MITIGATED, partially open** | Score parsing is now boundary-anchored at all call sites; the general tokenizer remains as-is |
| 11 | `install.sh --omp --global` path (`~/.omp/agent`) | **OPEN — needs upstream confirmation** | Note: `README.md:51` documents `~/.omp/agent` for `--global`, so code and docs agree; the critique requires verification against a live OMP build |
| 12 | OMP adapter has no test suite | **OPEN — not ticketed** | Pre-existing gap; new OMP logic verified by manual function-level review only |

## Review verdicts (independent QA agents)

| Ticket | Quality | Correctness | Pillars | Verdict |
|---|---|---|---|---|
| 1 — verdict script bounds | 9 | 9 | 9 | **PASS** |
| 2 — close-guard enforcement (3 adapters) | 9 | 10 | 9 | **PASS** |
| 3 — patch-path extraction sync | 8 | 9 | 8 | **PASS** |
| 4 — reviewer prompt alignment | 9 | 10 | 9 | **PASS** |
| 5 — docs housekeeping | 9 | 10 | 9 | **PASS** |

Reviewer nits addressed post-review: the "OpenCode" copy-paste doc comment in `adapters/ohmypi/extensions/beadfinder/lib/tools.ts:40` was corrected to note it is a parity copy. Remaining reviewer nits (accepted, non-blocking): OMP guard ships without automated tests (see #12); in mixed out-of-bounds + below-bar reasons the verdict script reports only the out-of-bounds dims on the first attempt.

**Conclusion**: All five ticketed critiques are fixed and independently verified; the three open items (#8, #9, #12) are the larger architectural consolidations that remain on the roadmap for a future overhaul bead.
