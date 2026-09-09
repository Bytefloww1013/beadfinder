import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendLine, debugLogPath, hooksDisabled, hostRoot, packStateDir, posixish, readJson, relToCwd, statePath, writeJson } from "./fsutil.ts";

describe("OMP fsutil paths", () => {
  test("state paths nest under .omp/beadfinder/ when that host dir exists", () => {
    const cwd = mkdtempSync(join(tmpdir(), "omp-bf-host-"));
    mkdirSync(join(cwd, ".omp", "beadfinder"), { recursive: true });
    expect(hostRoot(cwd)).toBe(join(cwd, ".omp"));
    expect(packStateDir(cwd)).toBe(join(cwd, ".omp", "beadfinder"));
    expect(statePath(cwd)).toBe(join(cwd, ".omp", "beadfinder", "state.json"));
    expect(debugLogPath(cwd)).toBe(join(cwd, ".omp", "beadfinder-debug.log"));
  });

  test("posixish normalizes separators to forward slashes", () => {
    expect(posixish("a/b/c")).toBe("a/b/c");
    expect(relToCwd("/tmp/repo", "/tmp/repo/src/app.ts")).toBe("src/app.ts");
    expect(relToCwd("/tmp/repo", "src/app.ts")).toBe("src/app.ts");
  });
});

describe("readJson / writeJson", () => {
  test("writeJson creates directories and writes pretty JSON with trailing newline", () => {
    const dir = mkdtempSync(join(tmpdir(), "omp-bf-fs-"));
    const file = join(dir, "nested", "deeper", "state.json");
    writeJson(file, { persona: "implementer", claims: 2 });
    expect(existsSync(file)).toBe(true);
    const text = readFileSync(file, "utf8");
    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text)).toEqual({ persona: "implementer", claims: 2 });
  });

  test("readJson returns the file contents when present", () => {
    const dir = mkdtempSync(join(tmpdir(), "omp-bf-fs-"));
    const file = join(dir, "data.json");
    writeJson(file, { ok: true });
    expect(readJson(file, { ok: false })).toEqual({ ok: true });
  });

  test("readJson returns the fallback for missing or corrupt files", () => {
    const dir = mkdtempSync(join(tmpdir(), "omp-bf-fs-"));
    const fallback = { fallback: true };
    expect(readJson(join(dir, "missing.json"), fallback)).toBe(fallback);
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{not valid json", "utf8");
    expect(readJson(bad, fallback)).toBe(fallback);
  });

  test("appendLine adds newline-terminated lines and creates the dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "omp-bf-fs-"));
    const file = join(dir, "logs", "out.log");
    appendLine(file, "first");
    appendLine(file, "second\n");
    expect(readFileSync(file, "utf8")).toBe("first\nsecond\n");
  });
});

describe("hooksDisabled", () => {
  test("responds to BEADFINDER_HOOKS off/0/false, default on", () => {
    const prev = process.env.BEADFINDER_HOOKS;
    try {
      delete process.env.BEADFINDER_HOOKS;
      expect(hooksDisabled()).toBe(false);
      for (const v of ["off", "0", "false", "OFF", "False"]) {
        process.env.BEADFINDER_HOOKS = v;
        expect(hooksDisabled()).toBe(true);
      }
      for (const v of ["on", "1", "true", "anything"]) {
        process.env.BEADFINDER_HOOKS = v;
        expect(hooksDisabled()).toBe(false);
      }
    } finally {
      if (prev === undefined) delete process.env.BEADFINDER_HOOKS;
      else process.env.BEADFINDER_HOOKS = prev;
    }
  });
});
