---
"@perchjs/core": minor
"@perchjs/ui": minor
---

Add the `Toggle` field, and connect the switch that was already built.

The control had been here for a while — styled, accessible, tested — with no
field declaring it and no registry entry pointing at it, so no form could put
one on a page. It now has both, plus `.onIcon()`, `.offIcon()` and
`.onColor()`, and it announces being required on the control rather than only
in the validation.
