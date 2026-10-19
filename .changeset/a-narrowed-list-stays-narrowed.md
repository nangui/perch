---
"@perchjs/ui": patch
---

Keep the search, the filters and the page size when a list is sorted or resized.

Sorting asked for the first page in the new order and nothing else, so a list narrowed to two part-timers came back as the whole company, at the server's default size. Choosing how many rows a page holds dropped the search and the filters the same way, and so did the size a reader's browser remembers, on arrival at a link to a narrowed list. Turning a page already kept all three; every request for more of the same rows now does.
