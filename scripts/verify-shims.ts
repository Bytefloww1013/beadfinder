#!/usr/bin/env bun
/**
 * Gate: adapter lib dirs are harness shims only. Shared code lives in
 * core/lib/ and is copied into the installed plugin by install.sh.
 *
 * Usage: bun scripts/verify-shims.ts
 * Exit 1 if a core file was copied back into adapters (the old three-fork).
 */
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

const CORE_FILES = [
  "bd.ts",
  "engine.ts",
  "fsutil.ts",
  "log.ts",
  "paths.ts",
  "policy-core.ts",
  "state.ts",
  "tools-core.ts",
] as const;

const SHIM_ONLY = new Set(["policy.ts", "tools.ts", "debug.ts"]);

const ADAPTER_LIBS = [
  "adapters/cline/plugins/beadfinder/lib",
  "adapters/opencode/plugins/beadfinder/lib",
  "adapters/ohmypi/extensions/beadfinder/lib",
] as const;

let failed = 0;
const rows: string[] = [];

for (const rel of ADAPTER_LIBS) {
  const dir = join(ROOT, rel);
  if (!existsSync(dir)) {
    failed++;
    rows.push(`MISSING  ${rel}`);
    continue;
  }
  for (const file of CORE_FILES) {
    if (existsSync(join(dir, file))) {
      failed++;
      rows.push(`FORKED   ${rel}/${file}  (belongs in core/lib; install.sh copies it)`);
    }
  }
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".ts")) continue;
    if (CORE_FILES.includes(name as (typeof CORE_FILES)[number])) continue;
    if (!SHIM_ONLY.has(name)) {
      failed++;
      rows.push(`UNKNOWN  ${rel}/${name}`);
    } else {
      rows.push(`shim     ${rel}/${name}`);
    }
  }
}

const width = Math.max(24, ...rows.map((r) => r.length)) + 2;
console.log("adapter shims (core/lib stays out of adapters)");
console.log("=".repeat(width));
for (const r of rows) console.log(r);
console.log("=".repeat(width));

if (failed > 0) {
  console.error(`\n${failed} adapter lib file(s) should not live under adapters/.`);
  console.error("Shared modules belong in core/lib/. install.sh copies them at install time.");
  process.exit(1);
}
console.log("\nadapters are shims only");
