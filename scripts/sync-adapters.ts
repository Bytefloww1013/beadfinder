#!/usr/bin/env bun
/**
 * Vendor core/lib/*.ts into each adapter's lib/ directory.
 *
 * core/lib/ is the single source of truth for shared adapter code. install.sh
 * copies each adapter's lib/ verbatim (no bundler), so sharing happens by
 * vendoring: this script copies core/lib/<file>.ts over the adapters listed
 * in MANIFEST below. Imports stay relative ("./x.ts"), so no import rewriting
 * is needed. Adapter-specific files (index.ts, tools.ts, policy.ts) are NOT
 * managed here. Never copy *.test.ts. Ohmypi is fully migrated; policy.ts
 * remains adapter-owned (shim).
 *
 * Usage:
 *   bun scripts/sync-adapters.ts          # copy core/lib files into adapters, print a table
 *   bun scripts/sync-adapters.ts --check  # verify only; exit 1 listing drifted files, copy nothing
 */
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

const LIB_FILES = ["log.ts", "fsutil.ts", "paths.ts", "state.ts", "bd.ts", "policy-core.ts", "tools-core.ts", "engine.ts"] as const;

const MANIFEST: Record<string, readonly string[]> = {
  "adapters/cline/plugins/beadfinder/lib": LIB_FILES,
  "adapters/opencode/plugins/beadfinder/lib": LIB_FILES,
  "adapters/ohmypi/extensions/beadfinder/lib": LIB_FILES,
};

const CHECK = process.argv.includes("--check");

let drifted = 0;
let copied = 0;

const rows: string[] = [];
for (const [destDir, files] of Object.entries(MANIFEST)) {
  for (const file of files) {
    if (file.endsWith(".test.ts")) continue; // never touch tests
    const src = join(ROOT, "core", "lib", file);
    const dest = join(ROOT, destDir, file);
    let same: boolean;
    try {
      same = readFileSync(src, "utf8") === readFileSync(dest, "utf8");
    } catch {
      same = false;
    }
    if (CHECK) {
      if (!same) {
        drifted++;
        rows.push(`DRIFTED  ${destDir}/${file}`);
      } else {
        rows.push(`in-sync  ${destDir}/${file}`);
      }
    } else {
      if (!same) {
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(src, dest);
        copied++;
        rows.push(`copied   ${destDir}/${file}`);
      } else {
        rows.push(`up-to-date  ${destDir}/${file}`);
      }
    }
  }
}

// Table
const width = Math.max(...rows.map((r) => r.length)) + 2;
console.log("vendor sync (core/lib -> adapters)");
console.log("=".repeat(width));
for (const r of rows) console.log(r);
console.log("=".repeat(width));

if (CHECK) {
  if (drifted > 0) {
    console.error(`\n${drifted} drifted file(s); run "bun run sync" to vendor core/lib into adapters.`);
    process.exit(1);
  }
  console.log("\nall vendored files in sync");
} else {
  console.log(`\n${copied} file(s) copied from core/lib`);
}

export {};
