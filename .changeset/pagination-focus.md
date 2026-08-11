---
"@perchjs/ui": patch
---

A pagination control with nowhere to go keeps its place in the tab order.

`disabled` takes an element out of the tab order, and a browser drops the focus
it was holding to the body — so a keyboard reader who pressed Next to the last
page was left nowhere, with the next Tab starting again from the top of the
document. The control is `aria-disabled` now: a real button that says it is
unavailable and does nothing when pressed anyway.

The alternative was to keep `disabled` and move the focus by hand, which means
choosing somewhere to send it and moving it under a reader who did not ask.

`aria-disabled` changes nothing a reader can see, so the control carries
`data-disabled` as well — the hook the stylesheet already uses for every field,
and the pair `Select` has been using for its empty state. Without it a control
with nowhere to go looks exactly as pressable as one that works. A test holds
that for every class a component marks, found by reading the directory rather
than a list, since the file that needs the guard is the one somebody has just
written.
