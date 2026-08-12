---
"@perchjs/core": minor
"@perchjs/ui": minor
---

Add `Hidden` and `Placeholder`, and the axis they needed.

Neither is settable by a client, and neither could say so: `disabled` and
`readOnly` are resolvable, so a field whose safety rested on one could be
unlocked by the resolver meant to lock it. A field now answers structurally
whether a client may set it at all, and one that answers no takes its value
from the row rather than from `default()` — and is kept out of the payload
entirely, because "hidden" names where a thing is drawn and never who may read
it.
