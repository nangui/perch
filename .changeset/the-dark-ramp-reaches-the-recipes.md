---
"@perchjs/ui": patch
---

Let the dark ramp and a theme reach every recipe, rather than only the rules that read a published name directly.

The recipes do not read `--perch-surface`. They read Panda's alias of it, `--perch-colors-surface: var(--perch-surface)`, and a custom property holding a `var()` is resolved on the element that declares it and inherited from there already resolved. The aliases were declared on `:root` alone, so every one of them froze at the light ramp.

**Dark was unusable where the guide says to put it.** `data-perch-theme="dark"` on `<body>` darkened the page behind white tables and white inputs, and the page title and the navigation were drawn in the light ramp's ink on the dark ramp's ground, which is to say not at all. Measured in a browser on the HR example: `--perch-surface` was `#181d20` on the body and `--perch-colors-surface` beside it was still `#fff`.

**A theme on `.perch-root` reached half the panel.** The HR example sets its accent there. The save button, which reads the published name, turned blue; the breadcrumb, the sort arrow and everything else reading the alias stayed the default green.

The aliases are now declared again on `.perch-root` and on any element carrying `data-perch-theme`, still inside `:where()`, so a theme keeps winning without a fight. Nothing to change on your side: a dark attribute or a theme that did not work now does.

The suite missed it because jsdom resolves neither a cascade layer nor an inherited `var()`. The guard added reads the generated sheet instead, and holds the selector the aliases are declared under.
