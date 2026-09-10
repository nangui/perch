# ADR 0028 — Where a drawing lives

**Status:** proposed · **Scope:** `@perchjs/ui` · **Supersedes decision 4 of [ADR 0027](0027-what-an-icon-is.md)**

*Everything else in ADR 0027 stands: an icon is a name, an unknown one is refused at boot, the set is small and shipped, a plugin's mark is not one, a named mark is `aria-hidden`, and no icon library is added.*

## Context

ADR 0027 decision 4 reads: *"The drawings live in one place — `@perchjs/ui`, beside the marks already there — and are the same kind of thing: a component returning an `svg`, `aria-hidden`, in `currentColor`. The two that sit in `DateTimePicker.tsx` today move there with them."*

Building it showed that sentence answers half the question. The named set landed in `icons.tsx`: twenty-six drawings on one grid, at one stroke, sized in `em` so a mark is the size of the words beside it. That uniformity is the promise a name makes — a mark on a tab and a mark on a heading are the same shape at the same weight whoever declared them.

The panel's own marks stayed where they were, in `fields/marks.tsx`, and they are not uniform. A select's chevron is wide and short because that is the space it has. A row menu's three dots are a strip. A repeater's grip is two tall columns of dots.

So six shapes now exist in two files, and the commit that brought the set in said so in a comment rather than settling it. Two of the six are the same path data written twice. "One place" is not wrong; it is underspecified, and what it leaves out is the reason there are two kinds of drawing at all.

## What verification established

1. **The named set is uniform by construction.** Twenty-six drawings, every one `viewBox="0 0 16 16"` at `stroke-width` 1.4, sized `1em` by `.perch-icon` so the surface's own type size decides. `icons.test.tsx` holds the box and the weight.
2. **The panel's own marks are not uniform, and that is what they are for.** `ChevronDown` is 10×6, `EllipsisMark` 16×4, `GripMark` 10×16, `CopyMark` a 16×16 box drawn at 13 px. Each is sized in pixels, in the component, against the slot it sits in.
3. **Two shapes are the same path data in two files.** The calendar's `d` attribute in `DateTimePicker.tsx` and in `icons.tsx` are byte-identical, as are the copy's in `fields/marks.tsx` and in `icons.tsx`. Neither is a different drawing; each is one drawing at a different size.
4. **Four are genuinely different drawings of one idea.** The chevrons, the ellipsis and the grip differ in box *and* geometry: a 10×6 chevron is not the 16×16 chevron scaled, and a 16×4 strip of dots is not the 16×16 one.
5. **A uniform box cannot produce a fitted one by sizing.** `preserveAspectRatio` defaults to `meet`, so a 16×16 drawing asked for 16×6 renders 6×6 in the middle of that width. `none` gets the width by stretching the stroke with it — which is the one thing the set exists to hold constant.
6. **The project has already collapsed one of these duplications, and recorded why.** The stylesheet used to draw the select chevron as a data URI beside the drawn one. It was removed because *"the copy in the stylesheet could not reach `currentColor`, so it named a grey and stayed that grey in the dark ramp while the drawn one lightened."* One shape, two drawings, and the second one drifted.
7. **One character is left that the panel types for itself:** a folding section's caret, `▸` and `▾`. The guard in `glyph-icons.test.ts` cannot see it — it matches a literal between two tags, and this one is an expression.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. One home. Every drawing is a named mark, sized by its caller** | The literal reading of "one place". Nothing is written twice, and there is one file to look in. | Not kept. Finding 5: it cannot express a fitted mark at all. A select would get a 6 px chevron in a 16 px gap, or a stretched one. Keeping A would mean redrawing every fitted mark on the uniform grid and changing how six controls look — paying for a filing decision with the panel's appearance. |
| **B. Two homes, one rule: uniform where a name asks, fitted where the panel draws for itself** | Says what the two kinds *are* rather than where they sit, so "which file" has an answer nobody has to remember. Duplicated path data collapses; different geometry stays. | **Proposed.** |
| **C. Leave it, and keep the comment** | Nothing to build. | Not kept. Finding 6 is what happens next: two drawings of one shape drift, and the one nobody is looking at is the one that goes wrong. The calendar and the copy are already in that state. |

## Decision

**1. There are two kinds of drawing, told apart by who asks for it.** A **named** mark is one a resource asked for by name. It is uniform: one box, one stroke, sized in `em` by the surface, and it is in the set ADR 0027 closed. A **fitted** mark is one the panel draws for itself, inside a component it owns, against a slot whose size it knows. It is drawn to that slot, sized in pixels, and it is not in the set and never on the wire.

**2. `icons.tsx` holds every named mark; `fields/marks.tsx` holds every fitted one.** A fitted mark does not live inside the component that uses it. `DateTimePicker`'s two move out, as ADR 0027 decision 4 already required — what changes is where each one moves to, which decision 3 settles.

**3. The same path data is never written twice.** Where what looked like a fitted mark turns out to be a named drawing at another size — the calendar, the copy — the component asks the set for it and sizes it, and the second copy goes. Only geometry that is actually different earns a second drawing. This is the test to apply to the next one: not "is it the same idea" but "is it the same `d`".

**4. Applied to what exists today.** The calendar is one drawing: `DateTimePicker` takes the named one. The copy is one drawing: the column's copy button takes the named one. The two side chevrons are 8×12, tall and narrow against a month header — a different drawing, so they stay fitted and move to `marks.tsx`. The four already in `marks.tsx` stay exactly as they are.

**5. A fitted mark is a shape, not a character.** The caret becomes a drawing like the rest. It is the last character the panel types for itself, and the reason it survived this long is that the guard could not see it.

**6. The guard grows to hold the rule, because the rule is otherwise a memory.** No `d` attribute appears in two files; no component in `@perchjs/ui` declares an `svg` outside those two; the named set stays uniform. The first is what stops the drift finding 6 describes, and it is the one that can be read straight off the sources.

## Consequences

- **The rule answers "which file" without anybody deciding.** A mark on the wire is named and uniform; a mark a component draws for its own slot is fitted. Nothing sits between the two.
- **Two duplicates go now**, and the sizes stay what they are: `DateTimePicker` draws the calendar at 14 px and the column draws the copy at 13 px, exactly as today — they stop carrying their own copy of the shape in order to do it.
- **A fitted mark stays outside ADR 0027's set**, so it is not a name, not refused at boot, and not something a resource can ask for. That is the line ADR 0027 decision 5 drew for a plugin's mark, for the same reason.
- **`marks.tsx` needs its doc comment corrected.** It currently describes the stylesheet's copy of the chevron as still there, and finding 6 says it was removed — a comment describing a state of the world that is gone.
- **The caret costs a drawing and a rule about which way it points**, which is more than a character cost, and it buys the last surface in the panel that still depends on a font.
- **A third kind will be proposed** — a mark that is fitted but wanted by name, or named but wanted at a slot's proportions. Decision 1 is what it has to argue against, and finding 5 is why the two cannot simply be merged.

## Reopening rule

The named set stops being uniform — a decision to ship marks at two weights or two boxes, for a reason about how the panel reads rather than about where files sit. Decision 1 rests on the set having exactly one box and one stroke, and that would be gone.

Nothing else. In particular, "there are two files" is not a reason: that is decision 1 working. Nor is "this fitted mark would be useful by name" — the answer there is to add the name to the set under ADR 0027 decision 3 and let the fitted one stay fitted, which is decision 3 of this record rather than a reopening of it.
