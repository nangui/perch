---
"@perchjs/ui": patch
---

Close a menu when the reader turns away from it. The actions on a table row and the column chooser are native `details` elements, and nothing in HTML says one should notice a click somewhere else, so a reader who opened a row's menu and thought better of it was left with it open. Because each row holds its own, a table ended up with three menus standing over the rows below them, which is how this was reported. One handler answers both halves, and the second falls out of the first: a click on another row's button is a click outside this one. `pointerdown` in the capture phase, so the menu is gone before whatever was clicked does its own work, and Escape as well, because a menu a mouse can dismiss and a keyboard cannot is a menu somebody is trapped in — focus goes back to the button that opened it. Choosing something inside the menu is not turning away from it, and stays open for the choice's own handler to act.
