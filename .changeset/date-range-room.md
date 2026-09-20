---
"@perchjs/ui": patch
---

Give a date range the room its two boxes need. The filter bar hands every filter one cell sized for one control, and a range holds two of them with a dash between, so each box came out at about 79px — under what a native date control needs. The browser does not shrink one gracefully: it clips, and what goes off the end is the calendar button, so the picker could not be opened by clicking and the value sat flush against the border. The range now takes two cells, which is what the schema filter already does for the same reason, and its boxes sit at their own width inside them rather than being stretched across: two cells is the room they need, not the size they should be. A number range never showed the clipping because its boxes are text boxes, which do shrink; that is a difference in how two controls fail, not a reason to leave one of them failing.
