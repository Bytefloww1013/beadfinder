#!/usr/bin/env python3
"""Append one debug line to the harness debug log.

Writes <repo>/.opencode/beadfinder-debug.log when that dir exists,
otherwise <repo>/.omp/beadfinder-debug.log. Dual installs get both.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path


def find_root(start: Path) -> Path:
    cur = start.resolve()
    for _ in range(12):
        if (
            (cur / ".opencode").is_dir()
            or (cur / ".omp").is_dir()
            or (cur / ".beads").is_dir()
            or (cur / ".git").is_dir()
        ):
            return cur
        if cur.parent == cur:
            break
        cur = cur.parent
    return start.resolve()


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--level", choices=("error", "warning", "concern", "info"), default="concern")
    p.add_argument("--source", choices=("agent", "advisor", "hook"), default="agent")
    p.add_argument("--hook", default="beadfinder-debug")
    p.add_argument("--message", required=True)
    p.add_argument("--details", default="")
    args = p.parse_args()

    root = find_root(Path.cwd())
    paths: list[Path] = []
    if (root / ".opencode").is_dir():
        paths.append(root / ".opencode" / "beadfinder-debug.log")
    if (root / ".omp").is_dir():
        paths.append(root / ".omp" / "beadfinder-debug.log")
    if not paths:
        paths.append(root / ".omp" / "beadfinder-debug.log")
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": args.level,
        "source": args.source,
        "hook": args.hook,
        "message": args.message,
        "details": args.details or None,
        "cwd": str(Path.cwd()),
        "pid": os.getpid(),
    }
    written: list[str] = []
    line = json.dumps(entry, ensure_ascii=False) + "\n"
    for log_path in paths:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as fh:
            fh.write(line)
        written.append(str(log_path))
    print(json.dumps({"ok": True, "path": written[0], "paths": written}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
