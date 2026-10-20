---
"@perchjs/ui": minor
---

Open a row's actions in a real menu.

The row menu was a `<details>`: placed by hand against the viewport, closed on a click elsewhere and on Escape by a hook written for it, moved through with Tab only, and drawn as a column of underlined links. It is Radix's dropdown menu now, `@radix-ui/react-dropdown-menu`, the family the panel's select and popover already come from: it opens on a click, on Enter and on the arrow keys, moves through its items with the arrows and by typing a letter, closes on Escape and on a click anywhere else, keeps itself inside the window, and gives the focus back to its button. An action's dialog opens once the focus is back there, so closing the dialog returns the reader to the row they were on.

What a theme meets:

- The button is a `<button class="perch-row-actions__open">` with `data-state="open"` while its menu is, rather than a `<summary>` inside `details.perch-row-actions`. A rule on `.perch-row-actions[open]` reaches nothing now.
- The menu, `.perch-row-actions__menu`, is drawn at the end of the page rather than inside the row, and only while it is open.
- An item is a `.perch-table__action` with `role="menuitem"` and `data-highlighted` under the pointer or the arrow keys. Run actions are no longer `<button>` elements; links are still `<a>`, so a new tab and a copied address work.
- Items read as a menu's, in the reader's colour on a tinted ground, and a group's heading is in sentence case.
