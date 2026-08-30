---
name: to-spec
description: After a plan slice has no open children, cut a small execute slice on Beads. Use when beadfinder is ready to hand a decided slice to implementer and reviewer.
metadata:
  version: "0.2.0"
---

# Cut an execute slice

Read closed plan tickets and their close reasons. Do not reopen the debate.

## Create

1. Implement slice epic. Labels: `beadfinder:slice`, `phase:execute`. `related` to the plan slice and the destination.
2. Two to four `beadfinder:build` tickets, persona `implementation`, mode `afk` unless the work is truly blocked on a human. Each description includes the ADR gist and acceptance.
3. One `beadfinder:review` ticket, persona `review`. `blocks` on the builds that must exist before review is meaningful (usually all of them, via waits or individual `blocks`).
4. `related` from each build to the ADR ticket.

## Do not

- Invent a 10+ step chain.
- `blocks`-serialize independent builds.
- Write `SPEC.md` as a second source of truth. The tickets are the spec.
- Start implementing.
- Cut a slice while the plan slice still has open children.

If the way is not actually clear, refuse and send the parent back to settle.
