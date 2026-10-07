---
"@perchjs/ui": patch
---

Move the button into the styling config, and teach the cascade guard that jsdom cannot see a layer.

Ten rules and eighty-one lines leave the hand-written sheet: the button, its hover, the two ways it says it cannot be used, its focus ring, and the primary, icon and danger modifiers. In source order, which is load-bearing here rather than tidy — a modifier's hover and the disabled state weigh the same, so the later one wins, and a disabled primary button still lightens under a pointer exactly as it did before.

**The surface was chosen for its guard rather than its size.** `button-cascade.test.ts` exists because a second `.perch-button` block once sat below the first for several releases, repainting every button in the panel while every test passed. It asks jsdom which rule wins instead of computing specificity, after three hand-rolled attempts at that were each wrong in a different way.

**And jsdom does not implement `@layer`.** Measured directly rather than assumed: a rule inside one is dropped entirely while an unlayered rule beside it applies. So moving the button into a layer made that guard blind, and reading both sheets did not fix it — the generated half arrived as nothing, and every answer would have been the browser default agreeing with itself. The sheet is unwrapped before it is injected now, which leaves specificity and source order, which is what the file is for. What it therefore does not cover is layer against unlayered; `sheets.test.ts` holds that by reading the text.

Probed with the regression it was written for: a duplicate base block after the modifiers, and it still fails.

**Two guards needed following rather than widening.** The target-size floor resolves a `var()` to pixels, and one hop stopped being enough — a size now reads the engine's token, which reads the property a theme overrides, which is the pixels. It also read rule blocks from one sheet with its selectors anchored at the line start, where a generated rule is indented inside its layer. Probed: an 18px small control fails the 24px floor again.

Nothing renamed, nothing published changed, the bundle unmoved and the stylesheet 12.72 kB gzip to 13.09.
