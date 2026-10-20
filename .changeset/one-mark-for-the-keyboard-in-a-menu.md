---
"@perchjs/ui": patch
---

Mark a row menu's item with its ground alone.

An item the arrow keys reached in a row's menu drew two marks: the tinted ground every menu draws, and the panel's focus ring around it. The ground is the mark now, as it is in the menus a reader already knows. A theme that wants the ring back sets `box-shadow` on `.perch-row-actions__menu .perch-table__action:focus-visible`.
