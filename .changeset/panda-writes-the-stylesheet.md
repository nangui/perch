---
"@perchjs/ui": minor
---

Move the design into `panda.config.ts` and delete `tokens.css`.

Every colour, size, radius and shadow the panel draws with is now declared in one place, once, with its dark value beside its light one. The hand-written token sheet held them in two blocks seventy lines apart, and only a test kept the two level — thirty-five colours and five shadows, each written twice, each a chance to update one and not the other.

**Nothing breaks, and that was the design constraint rather than a happy outcome.** The `--perch-*` custom properties are the panel's public theming API: a theme is a file that redefines them. Panda names its own properties after their category, so letting it own them outright would have renamed all hundred and eight. Instead the values are declared through `globalCss` under the names they already had, and each token points at one — `--perch-colors-surface: var(--perch-surface)`. Verified end to end: a theme overriding `--perch-accent` reaches a recipe that reads it. So there is no upgrade note, which is the measure of whether that was the right call.

Only a token a recipe reads is declared, because this package refuses to ship a custom property nothing reads. The token list in the config is therefore the register of which surfaces have moved, and it grows as they do rather than arriving complete and mostly dead.

The bytes did not move: the panel bundle is unchanged at 116.00 kB gzip, and the stylesheet went from 12.70 kB to 12.65. The first surface paid for the engine; this one was free.

Recorded in ADR 0038, which settles what ADR 0037 left open about how the panel looks.
