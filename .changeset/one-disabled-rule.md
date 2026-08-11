---
"@perchjs/ui": patch
---

The two ways a button says it cannot be used are one rule again, and a real
cascade says so.

There was no defect to fix: a disabled button is muted whatever modifier it
carries, and always was. `.perch-button:disabled` is a class plus a
pseudo-class and `--primary` is one class, so specificity settles it before
source order is consulted. What is removed is the split those two selectors had
been put into on the belief that position decided, and the comments that said
so.

The tests that answer this now ask jsdom rather than reading the stylesheet and
working out which rule wins. Three attempts at the second approach were wrong
in three different ways — one skipped attribute selectors, one counted no
specificity, one swallowed a comment as part of a selector — and each was
convincing enough to put a false claim in a commit message.
