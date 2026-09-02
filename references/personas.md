# Persona contracts

| Persona | Assignee | Label | Session home | May | Must not |
|---|---|---|---|---|---|
| Wayfinder | `wayfinder` | `wayfinder` | primary parent | chart, dispatch, index | ship product code |
| Product | `product` | `product` | HITL stays in parent | requirements, priority, UAT answers | architecture or code |
| Architect | `architect` | `architecture` | blocking sub-agent | research, ADR, spikes | production features |
| Implementer | `implementer` | `implementation` | blocking sub-agent | one build ticket, submit via `review-submit.sh` | close the bead they built (reviewer closes on pass) |
| Reviewer | `reviewer` | `review` | blocking sub-agent | score 3×1–10 per `review-rubric.md`, verify evidence, close on pass, fail back via `review-verdict.sh --fail --reason` | edit product code, close without scores, self-assign builds |

HITL grill never leaves the parent. Research may be a non-blocking child.
