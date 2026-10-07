---
"@perchjs/ui": patch
---

Move the markdown editor into the styling config, and assert the floor under its toolbar.

Twenty-eight rules and 211 lines: the frame, the toolbar and its buttons, the two panel tabs, the writing surface, the footer and counter, and the preview — which styles the bare elements markdown renders to. Twenty-six of twenty-nine selectors identical in their property sets; the three that differ all gained the engine's accessible expansion of `outline: none`, and nothing was lost.

The preview's rules reach bare elements, so they are the lowest specificity in the surface by some distance. Safe here, and worth saying why rather than discovering later: nothing in the panel styles a bare element, so there is no unlayered rule for these to lose to now that they sit in a layer.

**The surface arrived with no guard reading the stylesheet, so one was added.** The toolbar's buttons are pointer targets like every other control, and the only reason they met the 24px floor was that they happened to read the small-control height. They are in the target-size list now. Probed at 20px: it fails and names them.

**The guard audit this migration runs before each move was wrong twice on this one surface** — once over-counting a test that names the sheet in a comment without reading it, once missing a test that finds its targets by scanning components rather than naming a class. Both because the audit filtered sheet-readers by whether they mention the surface. It does not filter any more: every reader is checked, which is twelve files rather than one.

Nothing renamed, nothing published changed.
