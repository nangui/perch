---
"@perchjs/ui": patch
---

Bring a table and its filter bar to what a reader expects of one.

**Every sortable header says it sorts.** The mark appeared only on the sorted column, as a font's arrow, so every other sortable header looked like a plain one. Each now carries two drawn carets, in a quieter colour that still holds 3:1 on the header band; the sorted one keeps the caret pointing the way the rows run, in the accent. The `<span class="perch-table__sort-mark">` gains `data-active="true"` on the sorted column.

**A row is told apart from its neighbours.** On a wide screen a row takes `surface-muted` under the pointer, unless it is ticked. Cells are aligned to the middle rather than the top, so a line of text sits level with the avatar or badge beside it, and the last row no longer draws a rule one pixel above the container's edge.

**The header is quieter than the rows it names.** 12px on a `surface-muted` band, under `--perch-border` rather than the strong edge a control owes its surface.

**Filter labels match field labels.** Sentence case, weight 500, without the tracked capitals, and the bar is a little tighter: 10px of padding, 8px between rows of filters.

**A filter without a label is named like a column.** It fell back on its name verbatim, so `SelectFilter.make("employment")` sat labelled `employment` beside a box called Search; the tracked capitals had hidden it. The name is now read as a heading, `Employment`, the way a column or a field without a label already is.
