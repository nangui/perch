---
"@perchjs/ui": patch
---

Move the repeater into the styling config.

Twenty-six rules and 213 lines: the card, its head, the rows with their grip, fold, label, index, actions and note, the drag and pending states, and the dropzone. Twenty-one of twenty-four selectors identical in their property sets; the three that differ are the styling engine prefixing `user-select` for Safari, its accessible expansion of `outline: none`, and the half of a shared rule that stays behind.

**A new hazard, and the first one the port forces rather than merely risks.** Three of this surface's selectors were declared twice in the hand-written sheet — the item, the label and the fields — each time to put a later concern beside the rule it belonged with rather than beside the selector it repeated. A configuration object cannot hold a key twice, so the port merges them. Merging is only safe when the pairs declare nothing in common, and silently picks a winner when they do. Checked property by property before they were joined: all three pairs are disjoint.

**One rule was shared with a surface that has not moved.** `.perch-repeater__fields[hidden]` and `.perch-layout__body[hidden]` were one rule with two selectors. The repeater's half is generated and the layout keeps the rest, which costs one duplicated declaration while both sheets exist. The comment on it — that a class beats the browser's own sheet — survives the move: the browser's sheet is a weaker origin than any author rule, layered or not.

Nothing renamed, nothing published changed.
