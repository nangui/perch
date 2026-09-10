# ADR 0027 — What an icon is

**Status:** proposed · **Scope:** Perch (`@perchjs/core`, `@perchjs/ui`, `@perchjs/nest`)

## Context

`icon` is a free string. Four places in the core declare it — an action, a layout section, a tab, a column — and the renderer puts whatever arrived inside a span:

```tsx
const icon = typeof node.props?.["icon"] === "string" ? node.props["icon"] : undefined;
… <span className="perch-layout__icon" aria-hidden="true">{icon}</span>
```

So every icon a resource declares is a character, by construction. The example declares three: a bird on a tab and on a static `Icon`, an arrow on two action groups. That is not carelessness in the example — it is the only thing the API allows.

This came up because the panel just finished removing every typed mark from its own components. A calendar, a copy, a grip, a set of chevrons and three dots are drawings now, held by a guard that reads the components and refuses a character where a shape belongs. The guard cannot see a resource: an emoji crossing the wire as a prop is a mark the panel draws without any component having typed one, and it lands beside the shapes on the same screen.

A glyph is whatever the reader's font decided. It has no weight the panel chose, no size the panel chose, and in the case of an emoji, colours no theme can touch — in a panel drawn in one accent, on two ramps.

## What verification established

1. **The renderer does nothing with the value but print it.** No lookup, no validation, no fallback. A misspelling shows as a misspelling.
2. **Four declarations carry it** — `action.ts`, `layout.ts`, and two in `table.ts`. The same string reaches four different renderers.
3. **No icon library is a dependency of `@perchjs/ui`.** Nothing is installed to draw from.
4. **The panel already draws six marks of its own**, in `currentColor` and sized in the component. Four are in `fields/marks.tsx`; two — a calendar and a month arrow — are local to `DateTimePicker.tsx`. They are the shape a named icon would resolve to, they exist because a character was not good enough for the panel's own buttons, and the fact that two of the six sit somewhere else is the same drift a set would settle.
5. **The boot already refuses a word that is not in a list.** `audit.ts` checks a declared modal width against `MODAL_WIDTHS` and refuses an eleventh at start-up rather than letting it be drawn wrong. The audit runs on the server, over what a resource declared — it can see nothing a browser will decide later.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. A named set, resolved to a drawing, refused at boot** | `icon("bird")` becomes a shape the panel drew, at the panel's weight, in the theme's colour. An unknown name is a start-up failure, not a wrong screen. | **Proposed.** |
| **B. Leave it a free string, and say so** | Nothing to build. The rule "shapes, not characters" narrows honestly to the panel's own code. | Not kept. It leaves the framework unable to promise anything about how a panel looks, in the one place an author reaches for decoration — and it makes the guard on components a rule about where the code lives rather than about what a reader sees. |
| **C. Accept an SVG string from the resource** | Any icon, no set to choose. | Not kept. Markup crossing the wire to be put on a page is the shape of an injection, and the trust boundary exists so that a resource cannot hand the browser something to run. An icon is not worth the exception. |

## Decision

**1. An icon is a name, not a character.** `icon("bird")` names something the panel knows how to draw; the panel draws it, at its own weight, in `currentColor`.

**2. An unknown name is refused at boot**, the way an unknown modal width is. A resource that names an icon the panel does not have fails at start-up rather than showing a gap or a broken glyph where a reader expected a mark.

**3. The set is small and shipped, not open.** It covers what the framework's own surfaces need and what a CRUD panel asks for. Growing it is a change to the framework, which is what keeps it one set at one weight.

**4. The drawings live in one place** — `@perchjs/ui`, beside the marks already there — and are the same kind of thing: a component returning an `svg`, `aria-hidden`, in `currentColor`. The two that sit in `DateTimePicker.tsx` today move there with them.

**5. A plugin's own mark is not an icon name.** The named set is the framework's, and the boot can only refuse against what the server knows; a plugin registers its component in the browser, long after. So a third party that wants its own mark draws it inside the component it already registers, and never asks the panel to draw one by name. `icon` stays closed, and the refusal in decision 2 stays absolute rather than becoming a guess about what might exist later.

**6. A named icon is still `aria-hidden`.** It is decoration beside a label, as the character was: what a mark means is said in words next to it, and a vocabulary of names is not a reason to start announcing shapes.

**7. No icon library is added as a dependency.** The six marks that exist were drawn by hand and cost nothing to ship; a package brings hundreds of shapes, a licence and a version to the bundle budget for a set that is meant to be small.

## Consequences

- **A panel looks like one product.** The mark on a tab and the mark on a button are the same drawing at the same weight, whoever declared them.
- **A theme reaches every mark.** `currentColor` is what a character never followed.
- **`icon` becomes a closed vocabulary and its type should say so**, so a misspelling is a compile error for anybody writing TypeScript and a boot failure for everybody else.
- **The example changes.** Three declarations move from characters to names, and the tab stops carrying an emoji.
- **Somebody will want an icon the set does not have.** They open an issue and the set grows. A plugin does not go through the set at all: it draws its mark inside its own component, which is a different thing declared a different way, and the two never meet on the wire.
- **A migration is owed.** `icon` accepts anything today and would accept only names after; whether the old spelling is refused or merely deprecated is not settled here.

## Reopening rule

A panel that has to carry a customer's own iconography — a white-label deployment where the set is not the framework's to choose. Decision 3 assumes the set is small and shipped, and that assumption would be gone.

Nothing else. In particular, "the set is missing an icon I want" is not a reason: that is decision 3 working, and the answer is to add it.
