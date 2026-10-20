---
"@perchjs/ui": patch
---

Keep one gutter round a list on a phone.

On a phone the shell's main and the list both padded the page, and the list's title kept the browser's own heading margin. The three together put the title 50px under the menu bar and every card 34px in from each side. Below the narrow breakpoint the shell's main is the only gutter now, 16px on each side and above, and the list and its title add nothing to it. Wide windows are unchanged.
