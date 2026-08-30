# Notice and credits

Beadfinder is an original skill pack. It is not affiliated with, endorsed by, or part of the Beads or Wayfinder projects.

It reuses ideas from those projects and depends on the Beads CLI at runtime. Their authors keep the credit for that work.

## Beads

- Project: Beads (`bd`)
- Maintainers: gastownhall and Beads contributors
- License: MIT (Copyright (c) 2025 Beads Contributors)
- Source: https://github.com/gastownhall/beads
- Docs: https://beads.gascity.com/
- Example that shaped the persona split: https://github.com/gastownhall/beads/tree/main/examples/multiple-personas

Beads itself is **not** vendored here. Install the CLI separately. A copy of the Beads MIT license is in `third_party/beads/LICENSE`.

## Wayfinder

- Project: wayfinder skill
- Author: Matt Pocock
- License: MIT (Copyright (c) 2026 Matt Pocock)
- Source: https://github.com/mattpocock/skills/blob/main/skills/engineering/wayfinder/SKILL.md
- Suite: https://github.com/mattpocock/skills

A snapshot of the upstream Wayfinder skill (for credit and comparison, not as the runtime skill) is in `third_party/wayfinder/` along with its MIT license.

Beadfinder maps Wayfinder destination / fog / one-ticket-per-session rules onto Beads primitives (`bd ready`, `bd update --claim`, typed dependencies, labels). That mapping, the slice graph, the persona agents, and the helper scripts are this repo's work.
