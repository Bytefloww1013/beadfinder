---
name: research
description: Resolve an AFK research ticket by reading the repo, docs, or APIs and returning a fact a decision is waiting on. Use when beadfinder or architect spawns a research child.
metadata:
  version: "0.2.0"
---

# Research

AFK. No human required. One ticket.

1. Claim `bd update <id> --claim --json` if the parent did not already claim it.
2. Read outside or inside the repo until the Question is answered well enough to unblock the next ticket.
3. Comment the evidence (paths, URLs, short quotes). Do not paste a novel.
4. `bd close <id> --reason "<one-line fact>" --json`.
5. Create follow-up tickets only when you discovered a *sharp* new question. Label them, `--deps discovered-from:<id>`. Do not pre-slice fog.

Do not write production code. Do not close grill tickets. Do not update the destination epic unless the parent asked you to.
