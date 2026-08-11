---
"@perchjs/ui": patch
---

The repeater's reordering keeps the focus it was given.

Its move-up and move-down buttons were `disabled` at the ends of the list, and
so was the add button at the maximum. `disabled` takes an element out of the
tab order and a browser drops the focus it was holding to the body — so raising
an item to the top with the keyboard ended with the focus nowhere, in the one
control whose whole purpose is to be reachable without a mouse.

All three are `aria-disabled` now, paired with `data-disabled` for the
stylesheet, which is what the pagination and `Select` already do. Pressing a
direction with nowhere to go moves nothing — `move` already refused a
destination outside the list — and the add button asks for nothing past the
maximum, which nothing behind it would have refused.

The rule dressing a `data-disabled` button moves to the end of the stylesheet.
`.perch-button` is declared twice — the list page added a second block below the
first — and equal specificity makes source order decide, so written beside the
first the rule was painted over and nothing marked unavailable looked it.
`:disabled` stays where it was, so no button that uses it changes appearance.
