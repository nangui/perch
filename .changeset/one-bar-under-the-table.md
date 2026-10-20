---
"@perchjs/ui": patch
---

Put a list's count on the line of its pager and page size.

The count sat on a line of its own under the pager and the page size, so the bar under a table was two lines where one would do. It is one bar now: the count first, where a reader looks for how much there is, then the page size and the pager at the far end. The count stays the page's one live region. On a phone, Previous and Next wrap under it and share that line between them rather than huddling at its start.

A theme meets `.perch-list__total` inside `.perch-list__foot` now, as its first child, rather than after it.
