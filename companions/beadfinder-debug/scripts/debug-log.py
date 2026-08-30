#!/usr/bin/env python3
"""Append one debug line to <repo>/.omp/beadfinder-debug.log."""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path


def find_root(start: Path) -> Path:
    cur = start.resolve()
    for _ in range(12):
        if (cur / ".omp").is_dir() or (cur / ".beads").is_dir() or (cur / ".git").is_dir():
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
    log_path = root / ".omp" / "beadfinder-debug.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
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
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(json.dumps({"ok": True, "path": str(log_path)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
