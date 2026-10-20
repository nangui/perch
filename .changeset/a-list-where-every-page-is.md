---
"@perchjs/ui": patch
---

Put a list's title and table where every other page puts its own.

A list padded itself inside the shell's main, which already holds every page off the edges, and its title kept the browser's own heading margin. At 1440px its title sat 31px lower and its table 24px further in than the dashboard's, so everything jumped on the way from one page to the other. The shell's main is the only gutter now at every width, a list's title is spaced above as a page's title is, and what follows it starts 20px below, as the dashboard's cards do.

A theme that set `padding` on `.perch-list` keeps it; one that relied on the list's own padding sees the list move out to the shell's.
