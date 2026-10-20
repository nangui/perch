---
"@perchjs/ui": patch
---

Centre a stacked row's label against its value on a phone.

On a phone a row becomes a card, one line per column, with the column's name on the left and the value on the right. Those two were lined up on their text baseline, and a picture has no text: its baseline is its bottom edge, so beside an avatar "Name" sat level with the foot of the picture rather than with the name next to it. The two are centred against each other now, as a wide row already centres its cells.
