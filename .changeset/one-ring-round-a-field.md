---
"@perchjs/ui": patch
---

Draw one focus ring round a field, not two.

A field's box lights up while its text has the focus, and the panel's focus ring for anything without one of its own reached the text inside it as well. The inner ring was square inside a rounded box, so every focused text field showed two straight strokes standing inside its border. The text a reader types into, in a text input, a textarea, the markdown editor and the rich editor, no longer draws a ring of its own; the box round it does.
