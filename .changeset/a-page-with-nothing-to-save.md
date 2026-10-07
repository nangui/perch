---
"@perchjs/nest": patch
"@perchjs/ui": patch
---

Draw no save button on a page that has nothing to submit.

The save route already refused one — a page with no `submit` answers 404 rather than quietly accepting a write — and that was right without being enough. The client passed the save transport on every page it drew, so a dashboard carried a Save whose only possible outcome was that 404, on the screen a reader meets first.

The shell says so now, and only the shell can: `data-saves="false"` where the page has no `submit`, absent everywhere else, because savable is what every form route is and saying it on all of them would be stating the ordinary case out loud.
