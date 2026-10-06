---
"@perchjs/ui": minor
---

Generate the stat card's CSS with Panda instead of writing it by hand, as the first surface of a migration.

The card's eighty-six lines of hand-written CSS are gone. What replaces them is a slot recipe in `panda.config.ts`, and the stylesheet comes out of `panda cssgen` at build time: cascade layers, every value a custom property, and both colour ramps written once each with the dark value beside the light one rather than seventy lines apart.

**The class vocabulary did not change, and that was the point.** A recipe named `perch-stat` with a `label` slot emits `perch-stat__label` — the name that was already there. So the architecture's promise of a stable class on every structural element survives the move, which is what ruled out a utility-class framework for this panel and what makes a recipe engine the right shape instead.

The closed tone vocabulary is now held by the compiler. It used to be a `Set<string>` and a `data-tone` attribute a rule had to match; it is a recipe variant, and a name outside the four does not typecheck.

**What it costs, measured rather than estimated.** The main bundle went from 112.45 kB gzip to 116.00, and the stylesheet from 12.24 to 12.70. Almost all of the first number is a fixed cost: Panda's recipe runtime is about 3.5 kB gzip and the card's own recipe is 247 bytes, so one surface pays for the whole engine. The stylesheet grew because two token layers now ship — the hand-written `--perch-*` and Panda's own — and that only resolves when the hand-written one is gone.

**Two concessions, both real.** `@perchjs/ui` resolves modules as a bundler rather than as Node, because Panda's generated helpers import each other without file extensions. The package is bundled at both ends, so this describes it accurately, but it is a repository convention bent for one tool. And Park UI, which was the reason to pick this engine, is not usable: its preset declares a peer range admitting Panda 2 and contributes config that Panda 2 rejects. The design here stays the one the panel already had.
