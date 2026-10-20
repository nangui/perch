---
"@perchjs/ui": minor
---

Open the column chooser in a real menu, the one a row's actions use.

The column chooser was a `<details>` holding checkboxes: placed by hand under its button, closed on a click elsewhere and on Escape by a hook written for it, and walked through with Tab one box at a time. It is Radix's dropdown menu now, the same one a row's actions open: it opens on a click, on Enter and on the arrow keys, moves with the arrows and by typing a letter, keeps itself inside the window and gives the focus back to its button on Escape. Each column is a checkable item, ticked while the column is shown, and choosing one leaves the menu open, so taking three columns off is three choices rather than three menus.

What a theme meets:

- The button is a `<button class="perch-columns__button">` with a chevron and `data-state="open"` while its menu is, rather than a `<summary>` inside `details.perch-columns`. A rule on `.perch-columns` or `.perch-columns[open]` reaches nothing now.
- The menu, `.perch-columns__menu`, is drawn at the end of the page rather than under the button, and only while it is open. `.perch-columns__panel` is gone with the `details`.
- A column is a `.perch-columns__item` with `role="menuitemcheckbox"`, `aria-checked`, and `data-highlighted` under the pointer or the arrow keys, rather than a `label.perch-columns__row` round a checkbox.
