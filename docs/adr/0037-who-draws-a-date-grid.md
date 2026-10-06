# ADR 0037 — Who draws a date grid

**Status:** accepted · **Scope:** Perch (`@perchjs/ui`)

## Context

ARCH 13 §10 names the headless primitive by its brand: *"Accessible primitives | Radix (combobox, dialog, tabs, dropdown) — we do not rewrite a combobox."* That is a decision of record, so changing it needs one of these rather than a commit message.

What forced the question is not a preference between libraries. It is that Radix covers four of this panel's fields and not the fifth, and the fifth is the one where the pattern is hard: a date grid. The panel wrote its own, and the one it wrote does not meet the requirement in the same section it was written under.

Three libraries were on the table — Chakra UI, shadcn/ui, Ark UI — and the question asked of them was which fits the server side. That turned out to be the wrong axis, and finding out why is most of this record.

## What verification established

1. **There is no server side to fit.** `react-dom/server`, `renderToString` and `hydrateRoot` appear nowhere in this repository. `renderShell` returns a string — hand-written HTML with the payload in `data-` attributes — and `packages/ui/src/panel.tsx` mounts with `createRoot`. So the usual discriminator between styling libraries, whether their CSS survives a server render, discriminates nothing here: none of the three has a render pass to hook.

2. **The discriminator is ARCH 13 §9 instead:** *"CSS variables only — no theming in JavaScript."* Chakra UI v3 installs as `createSystem(defaultConfig, config)` passed to a `ChakraProvider` — a theme that is a JavaScript object evaluated at runtime. That is the thing that sentence forbids, in those words.

3. **The stack line is wrong about Tailwind, which decides shadcn.** `CLAUDE.md` and PRD 03 §96 both name Tailwind v4. There is no Tailwind dependency in any manifest, no config file, and zero occurrences of `@apply` or `@tailwind`: `styles.css` is 5043 hand-written lines, 87 `.perch-*` classes, 1067 custom-property reads and not one raw colour. shadcn/ui's own documentation requires Tailwind, and its components are copied source rather than a dependency. Adopting it means authoring the panel's appearance in utility classes, which dissolves the second level of ARCH 13 §9 — *"a stable class on every structural element, to override without forking"*. A reader can override `.perch-input`; nobody can override `flex h-9 w-full rounded-md border`.

4. **The grid the panel wrote is reachable and not navigable.** 31 day buttons under `role="group"`, no `onKeyDown` anywhere in the file, and no keyboard test. Its own comment says so: *"The real fix is the APG date-grid pattern with a roving tabindex — an open decision, not done here."* ARCH 13 §10 asks for full keyboard navigation in the same table that names Radix.

5. **Ark UI implements that pattern.** Measured in its source, not inferred from its README: `role="grid"`, `role="gridcell"`, `role="rowheader"`, a `tabIndex` that is 0 for the focused cell and -1 for the rest, and handlers for the arrows, Home, End, Page Up, Page Down and Enter. It ships no CSS, is styled by ordinary class names, and `parseDate("2026-03-04").toString()` returns the same string — so the panel's ISO discipline survives contact with it.

6. **The cost, measured by bundling each candidate with React external and gzipping it.** Radix's three primitives as the panel imports them: 34.58 kB. Ark's three equivalents: 44.38 kB. Ark's seven — those three plus the four fields the panel hand-rolled: 94.58 kB. Measured one at a time they sum to 111.95 kB against 73.30 kB together, so roughly 38 kB of that is one shared core amortised across components.

7. **No library may enter a table cell anyway.** `columns.tsx` and `DataTable.tsx` contain zero library imports; a cell is a plain function returning a `ReactNode`, which is what invariant 6 requires. So the surface any of these three could occupy is the fields, the menus and the dialogs — never the largest thing on the screen.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Keep the hand-written grid** | No dependency, and 352 lines that already pass their tests. | Not kept. Verification 4: the requirement is unmet, and writing a roving-tabindex date grid by hand is the exact thing ARCH 13 §10 says not to do. |
| **B. Chakra UI** | The most complete components of the three, and a design. | Not kept. Verification 2: its theme is JavaScript, against a written decision. |
| **C. shadcn/ui** | A design, which is the one thing neither other option gives. | Not kept **for the behaviour layer**. Verification 3: it is Radix underneath, so it answers nothing about the grid, and it brings Tailwind, which costs the CSS hooks. What it is actually good at — how the panel looks — is a separate question this record does not settle. |
| **D. Ark UI, for the grid only, in a lazy chunk** | The pattern, at no cost to the main bundle. | **Kept.** |
| **E. Ark UI, replacing Radix everywhere, now** | One primitive library instead of two. | Not kept yet. Verification 6 prices it at +9.80 kB for no behaviour the panel is missing, and it would rewrite four working fields to find out. Decision 5 says when. |

## Decision

**1. Ark UI is the headless primitive for what Radix does not cover.** Radix keeps what it already covers. Two libraries is the honest state of this for now, and pretending otherwise would mean rewriting four fields that work in order to make a sentence tidier.

**2. The date grid is Ark's, and it loads on its own chunk.** Dynamic import behind `Suspense`, the same shape the rich editor already uses. Measured: the main bundle went from 119.70 kB gzip to 111.77 kB, because the hand-written grid left it and nothing of Ark replaced it there; the grid is a 36.33 kB chunk fetched when a reader opens a calendar. A date field costs the main bundle less than it did, not more.

**3. The value contract stays ISO, and Ark's own input is not used.** `DatePicker.Input` formats and parses by locale, which is the ambiguity the whole field exists to prevent — 03/04 meaning two different days on two desks. The panel keeps its own ISO segments and feeds the grid a parsed day, guarding both ways a typed string fails: not shaped like a date, and shaped like one but naming no day.

**4. Today is computed in the zone the field declared, and an unusable zone is dropped rather than obeyed.** The grid takes the field's `timeZone`, so the day it marks is the panel's today rather than the reader's machine's. Without it the misreading the field exists to prevent would re-enter through the one date nobody typed.

A column's `timezone` is a free string nothing validates, and the date library throws on a name it does not know — `Europe/Pariss` and the empty string both do. Until this change a zone was a label drawn beside the control, so a typo in one was a word spelled wrong; computing with it is what gave the same typo the power to stop a form drawing. An unusable zone is therefore ignored, and the grid falls back to the reader's own: at worst a day out on a hint, where the alternative was a blank form. Found by attacking this change rather than by it failing.

**5. Deliberately not here**, each named so a reader learns it was decided rather than forgotten: replacing Radix's popover, select and switch; the three other fields Ark could take over — tags, colour and file upload, all of which wrap a native input and are correct as they stand; and how the panel looks, which is the question shadcn/ui is actually the answer to and which no decision has been taken on.

## Consequences

- **Two primitive libraries ship, not one.** 34.58 kB of Radix in the main bundle and a 36.33 kB Ark chunk beside it. The duplication is in the dependency list rather than in the bytes a reader downloads, because the two never load on the same request.
- **A date field is keyboard-operable for the first time**, and held by tests that walk it: one tab stop for the month instead of thirty-one, the arrows across it, Home and End to the month's own ends, Page Up and Page Down between months, Enter to commit.
- **The split is guarded.** `bundle-budget.test.ts` now asserts that `panel.js` carries no trace of the grid and that some chunk does — the same pair of assertions that holds the editor's split, because a single static import undoes either silently. Probed: made static, the first assertion fails.
- **Two behaviours changed, both towards what was already drawn.** A day lent by a neighbouring month is no longer selectable, which is what `cursor: not-allowed` on it has claimed all along; and a date field with no value opens on today rather than on January 2026, which a placeholder fallback had been doing for ever.
- **`Calendar` is gone from `@perchjs/ui`'s exports**, replaced by `CalendarSurface`. A breaking change, recorded in the upgrade guide.
- **One assertion stopped being vacuous.** The a11y check that a `role="grid"` has rows and gridcells under it looped over an empty list while the calendar declared `group`. It walks a real grid now. Worth remembering about any assertion written as a loop over what might be nothing.
- **Ark reached the panel's own conclusion about the weekday strip** and hides it from assistive technology, which is what the strip it replaces already did and for the written reason: the letters are noise on the way past, and every day carries its own written-out date.

## Reopening rule

**One:** a fifth field needs a primitive Radix has and Ark also has. Then two libraries is costing bytes rather than only tidiness, option E is worth re-pricing at that point's real numbers, and decision 1 should be revisited.

**Two:** the main bundle passes 200 kB gzip against the 250 kB budget in ADR 0009. Then the 34.58 kB of Radix in it is a candidate for the chunking that decision 2 did to the grid, and decision 1's "two libraries" is the first thing to question.

**Three:** a decision is taken on how the panel looks. Then shadcn/ui is back on the table on its own merits, and option C's second sentence is the one to argue with — not its first, which is about the grid and is settled.

Does not reopen this: that two primitive libraries is untidy. Verification 6 priced the tidy version and it costs 9.80 kB and four rewritten fields for no behaviour anybody is missing.
