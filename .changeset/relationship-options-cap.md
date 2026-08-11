---
"@perchjs/core": patch
"@perchjs/nest": patch
---

Keep the value being edited in a relationship select's options.

`optionsLimit` makes the list a window, and the row being edited may point
outside it. The select then rendered holding a value its own options did not
contain, the browser showed whatever came first, and saving rewrote a field
nobody had touched.
