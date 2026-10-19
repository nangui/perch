---
"@perchjs/ui": patch
---

Open the panel's own list from a filter and from the page size, rather than the platform's.

**A choice filter and "Rows per page" are Radix selects now**, the one a form's `Select` field already is. A native `<select>` opened a menu the operating system drew, in its own font, at its own size and wherever it chose to put it, and no stylesheet reaches it: next to a form's list it looked like another product. The new trigger is a `.perch-control` with a `.perch-select__chevron`, its list a `.perch-popover` of `.perch-option`, and it is named by the visible label through `aria-labelledby`. "Any" is still the first choice of a filter and still sends nothing.

The filter's wrapper is a `<div class="perch-list__narrow">` rather than a `<label>`: inside a form, Radix renders a hidden native select beside its trigger, and a label round both would name whichever came first. The page size is a `<div class="perch-list__size">` for the same reason. A theme's rules for `.perch-list__size select` reach nothing now and can go.

A select in an editable table cell stays native. A Radix select is a component with state and context, and a cell is drawn by one render function per column type.

**An option's tick sits at the end of its row.** Without a meta to push it, it was drawn against the word, `Any ✓`, in a form's `Select` as well.
