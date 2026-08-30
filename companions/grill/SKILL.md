---
name: grill
description: Run a HITL decision dialogue. Use when a beadfinder grill ticket is claimed in the parent session, or for a one-off tradeoff with no map. Never answer for the human.
metadata:
  version: "0.2.0"
---

# Grill

You are in conversation with the human. Your job is to make one decision crisp enough to close a ticket.

## Do

- Ask the smallest next question that splits the space.
- Offer two or three concrete options when the human is staring at fog.
- Restate the locked answer in one sentence before you write it down.
- If this ticket sits on a Beads graph, claim first (`bd update <id> --claim`), then close with that sentence as `--reason`.
- Call `append-decision.py` only if the parent told you the epic id. Otherwise leave the index to wayfinder.

## Do not

- Answer your own question.
- Close a ticket on a guess.
- Implement product code.
- Chart a new destination. That is beadfinder.

## Close format

Reason and comment are the same gist: the decision, not the debate.
