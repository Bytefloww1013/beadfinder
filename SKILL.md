---
name: beadfinder
description: Chart a Beads destination epic, settle one frontier ticket per session, and cut execute slices when a plan slice is decided. Use for multi-session work, persona handoff, or when markdown TODOs and GitHub issues are the wrong tracker.
metadata:
  version: "0.2.0"
  tracker: beads
---

# Beadfinder

Orchestrator only. Chart the graph, pick the next ticket, spawn the matching worker, record the gist. Do not become the grill script, the researcher, or the implementer.

Companion skills (load on demand): `grill`, `research`, `to-spec`.
Persona agents (spawn, do not re-prompt here): `architect`, `implementer`, `reviewer`, `product`.

Beads is the only tracker. `--json` on every parsed `bd` call.

## Graph

```
Destination epic     label beadfinder:destination     stays open
  Plan slice epic    label beadfinder:slice, phase:wayfind
    decision tickets
  Implement slice    label beadfinder:slice, phase:execute
    build + review tickets     related to the plan slice
```

Create an implement slice only after that plan slice has no open children. Other plan slices may stay open. Do not dump every child into the destination description.

Ticket body:

```markdown
## Question

<one session of work>

## Acceptance

<what close requires>
```

Slice/destination body keeps Destination, Notes, Decisions so far, Not yet specified, Out of scope. Open tickets are not listed there.

## Labels

Exactly one of each where it applies.

- Destination: `beadfinder:destination`
- Slice: `beadfinder:slice`
- Phase: `phase:wayfind` or `phase:execute`
- Type: `beadfinder:grill` `beadfinder:research` `beadfinder:prototype` `beadfinder:task` `beadfinder:build` `beadfinder:review`
- Persona: `architecture` `implementation` `review` `product` `wayfinder`
- Mode: `hitl` or `afk`

Assignees: `wayfinder` `architect` `implementer` `reviewer` `product`.

## Scripts

Run from this skill's `scripts/` directory. Prefer them over hand-rolled `bd ready | jq`.

- `session-boot.sh [--persona name] [--parent slice-id]` — start of every parent session
- `frontier.sh --parent <slice> --persona <name>` — look, do not claim
- `claim-next.sh --parent <slice> --persona <name>` — atomic pick+claim. Exit 2 = empty
- `append-decision.py --epic <id> --title "..." --id <ticket> --gist "..."` — map-body append

Never select an id in one step and claim it in another.

## Session types

### Chart

User brings a loose idea. Stay in the parent.

1. `session-boot.sh`
2. If `bd` is missing, stop.
3. Name the destination with the human. Load `grill` if the destination is still mushy.
4. If the path is already one session of work, do not create a graph. Ask how they want to proceed.
5. Create destination epic. Create one plan slice. Create only sharp tickets (usually 2-5). Wire `blocks` in a second pass. Fog stays in Not yet specified.
6. Spawn AFK `research` children in parallel. Do not resolve grill, prototype, build, or review here.
7. Stop. Report destination, slice, frontier, fog.

### Settle

Parent session. One non-research ticket.

1. `session-boot.sh --parent <plan-slice> --persona wayfinder`
2. HITL (`beadfinder:grill`, prototype reaction, product call) — keep in this session. Load `grill`. Claim the named ticket with `bd update <id> --claim`. Never `claim-next` without a type filter on HITL queues.
3. AFK research already running — wait or spawn `research`.
4. ADR / design — spawn blocking `architect` with ticket id, title, and the gists it must respect.
5. On close: comment the answer, `bd close --reason "<gist>"`, `append-decision.py` on the plan slice, `bd remember` only for invariants that every later session needs.
6. File newly sharp tickets. Graduate fog. Close mis-scoped tickets onto Out of scope.
7. Stop.

### Handoff (cut execute slice)

When the plan slice has no open children and the way for *that slice* is clear:

1. Load `to-spec`.
2. Create implement slice epic (`phase:execute`, `beadfinder:slice`), `related` to the plan slice and the destination.
3. Create few build tickets and one review ticket. `related` to the ADR. `blocks` only when B cannot start before A.
4. Stop. Do not implement in the handoff session.

### Execute

1. `session-boot.sh --parent <impl-slice> --persona implementer` (or reviewer).
2. Spawn **one** blocking worker with the ticket id and the ADR gist in the prompt.
3. Implementer files discovered work with `discovered-from`. Reviewer files blockers that `blocks` the review. Reviewer does not edit product code.
4. After the child returns, append-decision on the implement slice if a ticket closed. Stop.

## Spawn rules

- Parent primary is `wayfinder`.
- Spawn `architect`, `implementer`, `reviewer`. Spawn `product` only for non-grill product tickets.
- HITL stays in the parent. A background child will answer for the human.
- Research children may run in parallel and need not block.
- Everyone else blocks the parent.
- Child prompt includes: ticket title, id, parent slice id, ADR/decision gists, "one ticket only", "claim before work".

## Hard rules

- Claim before work.
- One non-research ticket per session.
- Refer by title, wrap the id inside the name.
- Do not restatedecisions on the epic. Gist + link.
- Do not invent a second tracker.
- Do not `blocks`-chain an entire implement slice into a linked list.
- If `claim-next` exits 2, stop and report empty frontier.
