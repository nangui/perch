---
"@perchjs/ui": minor
---

Say what an action answered in a toast rather than in a strip above the table.

The message an action answers with was a strip in the flow above the table: it pushed the rows down by its own height, stayed until the next thing happened, and could not be put away. It is a toast now, drawn by `@radix-ui/react-toast` over the page in its top corner, or along the foot of the screen on a phone, where the top is the menu bar. It has a close button, holds its timer while the pointer or the focus is on it, can be swiped away, and F8 reaches it from the keyboard. It is still announced politely, and its words and tone are still the server's.

A success or a note goes by itself after five seconds. A warning or a danger stays until it is closed, because a failure that leaves on its own is one a reader who looked away never learns about. One message at a time, as before: a second replaces the first.

What a theme meets:

- The message is a `.perch-toast` with `.perch-toast--success`, `--warning`, `--danger` or `--info`, inside `.perch-toasts`, holding `.perch-toast__title`, `.perch-toast__body` and `.perch-toast__close`. It is no longer a `p.perch-notice` before the table.
- `.perch-notice--success`, `.perch-notice--warning` and `.perch-notice--info` are gone. `.perch-notice` itself stays, for the failure a form shows beside itself when the server cannot be reached.
