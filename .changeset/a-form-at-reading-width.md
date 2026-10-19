---
"@perchjs/ui": patch
---

Bring a form at rest to what a reader expects of one: as wide as a line worth reading, with text that has room, labels in sentence case and a button as tall as the fields above it.

**A form stops at 48rem.** One column of fields stretched across the whole page made a name a word typed into a box four times longer than any name. A form holding a layout that declared columns asked for the width to set them side by side, and keeps it, up to 80rem. The `<form>` now carries `perch-form`, so the width is a hook like any other.

**Text has a line height.** Nothing set one, `preflight` being off, so every line sat at the browser's `normal`, about 1.2, and rows and labels read as cramped. `.perch-root` sets 1.5.

**The font stacks say what renders.** `--perch-font-sans` named Libre Franklin and `--perch-font-mono` IBM Plex Mono, and the panel ships no font files, so every reader got the fallback while the token claimed otherwise. Both are now system stacks. A theme loading a face of its own sets the token as before.

**A label is a label.** Field labels were 12px tracked capitals, every one at the same volume, and a path borrowed as a heading read as one word: `JOBTITLE`. They are now 13px, weight 500, in sentence case.

**A button is as tall as a control.** 28px beside 34px fields made Save the smallest thing on the page. It is 34px now, weight 500, with a transition on its colours. Icon buttons keep 28px, and the filter bar keeps its compact row.

**A control's edge is lighter.** `--perch-border-strong` goes from `#767f84` to `#8a9398` in the light ramp, which still holds the 3:1 a control's edge owes the surface it sits on.
