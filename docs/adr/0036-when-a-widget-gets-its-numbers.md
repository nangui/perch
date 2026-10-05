# ADR 0036 — When a widget gets its numbers, and who may ask for them

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/nest`, `@perchjs/ui`)

## Context

Widgets are the last unbuilt half of PRD 09 and the most visible thing left in the v0.3 tier: a dashboard is the first screen a reader meets, and this panel has none.

The aggregate port was built first, deliberately, because PRD 09 §6 names widget aggregates escaping tenant scoping as its only Critical risk and points the mitigation at the `DataAdapter`. That is done: a stat can be a port call rather than a widget holding a client.

What is left to settle is not what a widget computes but **when its numbers arrive**, and PRD 09 §3.3 has already ruled out the shape everything else in this panel uses.

## What verification established

1. **Nothing exists.** No `Widget` in any package's source, and `core` exports no `Stat`. This is a first record rather than a correction.

2. **The dashboard needs no new page concept.** `PanelModule.forRoot` already takes `pages`, and its own comment lists *"settings, an import screen, a business dashboard"* as what they are for. `custom-page.ts` goes further: a page with no `submit` *is* a dashboard, and the panel draws it no save button. So a dashboard is a page that holds widgets.

3. **PRD 09 §3.3 forbids the shape the rest of the panel uses.** *"Each widget is loaded independently and in parallel, after the chrome has rendered. The dashboard appears immediately with skeletons. A slow widget does not block the others; a failed widget shows a local error, never a blank screen."* Every other screen here embeds its values in the shell: a list page carries its first page of rows, a form carries its resolved state. A dashboard may not, and one widget's failure may not be the page's.

4. **The route family addresses things by a name or by an id, and nothing else.** Measured across the controllers: reads are `GET`, state-carrying requests are `POST`, an action is `actions/:action`, a relation is `relations/:name`. A widget has no id and belongs to no record, so a name is what is left.

5. **The port already serves a stat.** `aggregate` is on `DataAdapter`, narrowed like any read, so a widget needs no new way to reach the database and no reason to hold a client.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Values in the page payload, like every other screen** | One request, one render, consistent with the list and the form. | Not kept. Verification 3: eight widgets of heavy aggregates would hold the whole page, and one of them failing would answer a page with no dashboard on it. |
| **B. One request per widget, after the shell** | The chrome draws at once, the slow one is slow alone, and the failed one fails alone. | **Kept.** |
| **C. One request carrying every widget** | Fewer round trips than B. | Not kept. It reintroduces exactly what B is for: the answer waits for the slowest, and a single error shape cannot say which card broke without inventing one. |
| **D. A stream the shell opens** | One connection, values as they land. | Not kept for this record. It is B's advantage with more machinery, and nothing else in this panel streams; if that changes, the reopening rule below says so. |

## Decision

**1. A widget is declared the way a resource and a page are.** A class with a decorator, listed in `PanelModule.forRoot`, instantiated by the container. A widget that cannot inject the service holding its numbers is a widget that cannot do its one job, which is the argument `custom-page.ts` already makes for a settings page.

**2. Its numbers arrive on their own request, one per widget, after the shell.** The shell sends the roster and no values: which widgets this reader gets, in what order, and how much width each asks for. Verification 3 is why, and it is the first place in this panel where something is drawn before its values exist.

**3. A widget is addressed by a name.** Verification 4. Not by an index, which would make a roster's order part of its address, and not by a class name, which minification is entitled to change.

**4. One widget's failure is that widget's.** A request per widget means a 500 is local by construction rather than by a convention somebody has to keep. The client draws an error in that card and the others are untouched.

**5. Authorisation is asked when the numbers are asked, and the roster is narrowed as well.** Both, because neither alone is enough. A roster listing a widget the reader may not have tells them it exists, which is the same leak a hidden-but-sent column is; and a roster that omits it is not a protection, because the route is still there to be asked. This is invariant 8 in its own words: a hidden button is not a protection.

**6. `StatsWidget` first, and `Stat` is a builder.** Immutable and fluent like every other builder here, for the reason invariant 3 gives: one shared between requests leaks one reader's numbers into another's.

**7. Deliberately not here**, each named so a reader learns it was decided rather than forgotten: polling, the per-widget cache, the global period filter, widgets on resource pages, and every widget type but stats. `ChartWidget` waits on a charting library nobody has chosen, and PRD 09 §6 allows exactly one.

## Consequences

- **The panel draws something before its values exist**, for the first time. A skeleton is the client's to draw, and it is the only thing about a widget the client works out; the numbers remain the server's, so invariant 1 holds.
- **A dashboard costs one request per widget.** That is the trade PRD 09 §3.3 asks for, and it is why the budget there is written per widget rather than per page.
- **The budget becomes measurable**, not before. Each widget under 500 ms and the dashboard interactive under 400 ms cannot be held by a test until there is a dashboard to point one at.
- **A widget may still hold a client**, because nothing in TypeScript stops it. What changed is that it no longer has to: the port answers a stat, narrowed like any read, which is where tenancy will reach when PRD 04 §8 is built.
- **Nothing is cached**, so a reader who reloads pays again. Named rather than hidden: PRD 09 §3.3 recommends a 60 second default and that is a later decision, not an oversight in this one.

## Reopening rule

**One:** a widget needs the record its page is about, which an Edit page's widget would. Then decision 3 is addressing too little, and a record supersedes this one with whatever carries the record.

**Two:** the shell gains a stream, for notifications or for anything else. Then option D stops being extra machinery and becomes the cheaper shape, and decision 2 should be revisited rather than kept out of consistency.

**Three:** a dashboard is measured over the budget in PRD 09 §3.3 with widgets that are each inside it. Then the cost is the request per widget rather than the work in them, and option C is worth re-pricing with a per-card error shape argued rather than assumed.

Does not reopen this: disliking that a dashboard flickers while it fills. That is what PRD 09 §3.3 asks for, and the alternative is a page that shows nothing until its slowest number arrives.
