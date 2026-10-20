---
"@perchjs/ui": patch
---

Keep a keyboard reader's place in a table once an action takes a row away.

Deleting a row from its menu took the row's menu button with it, and the button was where the focus was: the browser dropped it to the top of the document, and the next Tab started again from the navigation. The focus now goes to the same place in the table once the rows come back: the menu button of the row that moved up into it, the last row's when it was the last, and the list's title when the table emptied. An action that leaves its row standing leaves the focus where it was.
