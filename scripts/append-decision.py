#!/usr/bin/env python3
"""Append one Decisions-so-far line to a slice or destination epic description."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys

SECTION = "## Decisions so far"


def bd_json(args: list[str]) -> dict | list:
    proc = subprocess.run(["bd", *args, "--json"], capture_output=True, text=True)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr or proc.stdout or "bd failed\n")
        sys.exit(proc.returncode or 1)
    raw = (proc.stdout or "").strip()
    if not raw:
        return {}
    return json.loads(raw)


def description_of(issue: dict) -> str:
    for key in ("description", "Description", "desc", "body"):
        val = issue.get(key)
        if isinstance(val, str):
            return val
    return ""


def insert_line(body: str, line: str) -> str:
    if SECTION in body:
        parts = body.split(SECTION, 1)
        head, tail = parts[0], parts[1]
        rest = tail.lstrip("\n")
        return f"{head}{SECTION}\n\n{line}\n{rest}" if rest else f"{head}{SECTION}\n\n{line}\n"
    if body and not body.endswith("\n"):
        body += "\n"
    return f"{body}\n{SECTION}\n\n{line}\n"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--epic", required=True, help="slice or destination id")
    p.add_argument("--title", required=True)
    p.add_argument("--id", required=True, help="closed ticket id")
    p.add_argument("--gist", required=True)
    args = p.parse_args()

    shown = bd_json(["show", args.epic])
    issue = shown[0] if isinstance(shown, list) else shown
    if not issue:
        print("epic not found", file=sys.stderr)
        return 1

    line = f"- {args.title} ({args.id}): {args.gist}"
    new_body = insert_line(description_of(issue), line)

    proc = subprocess.run(
        ["bd", "update", args.epic, "--description", new_body, "--json"],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr or proc.stdout or "bd update failed\n")
        return proc.returncode or 1
    print(proc.stdout.strip() or json.dumps({"ok": True, "epic": args.epic, "appended": line}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
