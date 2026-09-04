# Persona contracts

| Persona | Assignee | Role label | Stage | Session home | May | Must not |
|---|---|---|---|---|---|---|
| Wayfinder | `wayfinder` | `wayfind` | plan | primary parent | chart, dispatch, index | ship product code |
| Research | `research` | `research` | plan (spawned), requirements, design | spawned non-blocking (AFK) child | one research ticket, evidence-based answers | product code, closing grilling beads |
| Product | `product` | `product` | requirements (human-in-loop) | stays in parent | requirements, priority, UAT answers | architecture or code |
| Architect | `architect` | `architect` | design | blocking sub-agent | ADRs, ARCHITECTURE.md/IMPLEMENTATION.md sections, spikes | production features |
| Implementer | `implementer` | `implementation` | implement | blocking sub-agent | one build ticket, submit via `review-submit.sh` | close the bead they built (reviewer closes on pass) |
| Reviewer | `reviewer` | `review` | review | blocking sub-agent | score 3×1–10 per `review-rubric.md`, verify evidence, close on pass, fail back via `review-verdict.sh --fail --reason` | edit product code, close without scores, self-assign builds |

Grilling beads never leave the parent; research may be a non-blocking child. The deprecated
v0.6 role labels (`wayfinder`, `architecture`) remain routed by the hook layer for backward
compatibility but must not be used on new beads.
