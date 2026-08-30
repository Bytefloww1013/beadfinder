# Beads operations

Always `--json` when parsing.

## Boot and memory

```bash
scripts/session-boot.sh --persona wayfinder
bd remember "Rate limit key is per-user with a per-IP ceiling"
bd prime
```

`bd remember` is for invariants. Ticket answers stay on the closed bead plus Decisions so far.

## Create

```bash
bd create "Destination: Ship rate limiting" -t epic -p 1 \
  -l "beadfinder:destination" --json

bd create "Plan: key + algorithm" -t epic -p 1 \
  --parent <dest-id> -l "beadfinder:slice,phase:wayfind" --json

bd create "Grill: per-user or per-IP" -t task -p 1 \
  --parent <plan-id> \
  -l "beadfinder:grill,phase:wayfind,product,hitl" --json

bd dep add <blocked> <blocker> --type blocks
bd dep add <impl-slice> <plan-slice> --type related
bd create "Found X" -t bug -p 1 --deps discovered-from:<current> --json
```

## Frontier and claim

```bash
scripts/frontier.sh --parent <slice-id> --persona implementer
scripts/claim-next.sh --parent <slice-id> --persona implementer
bd update <id> --claim --json          # named ticket, HITL
```

Empty `claim-next` exits 2.

## Close and index

```bash
bd comment <id> "<answer>"
bd close <id> --reason "<gist>" --json
python3 scripts/append-decision.py --epic <slice-id> --title "..." --id <id> --gist "..."
```

## Yield a bad claim

```bash
bd assign <id> ""
bd update <id> --status open --json
```
