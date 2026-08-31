# ADR 0026 — How a filter is named

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/nest`, `@perchjs/ui`)

## Context

PRD 07 §4 lists, among the filters due in v0.2, `Filter.make().schema([...])` — "a custom filter with a free schema". What shipped is `SchemaFilter.make(name).schema([...])`, and every other filter in the catalogue shipped the same way: `TernaryFilter.make(name)`, `TrashedFilter.make()`, `TextFilter.make(name)`, `SelectFilter.make(name)`, `DateRangeFilter.make(name)`, `NumberRangeFilter.make(name)`.

The disagreement is small and it is about one thing: whether the base class is a factory. `Filter.make()` reads as one — a filter is made from the abstract class and then told what it is by the method called next. `SchemaFilter.make()` reads as the opposite: what kind of filter it is decided first, and the name comes with it.

It is worth settling rather than leaving because both spellings are public API. Fixing the document costs a line; fixing the code costs everybody who has written a filter.

## What verification established

1. **`Filter` is abstract and has no `make`.** Six concrete filters have one, each returning its own class. Nothing in the shipped code could satisfy `Filter.make()` without adding a static to the base.
2. **A filter needs its name at construction.** `make(name)` is what keys it in `declaredFilters`, what the boot refuses duplicates by, and what a request names when it arrives. A filter made without one would have to be given it by a later call, and a filter that never got there would be undetectable until a reader used it.
3. **The pattern is uniform across the catalogue, and beyond it.** Fields, columns and actions all name the concrete class first: `TextInput.make`, `TextColumn.make`, `DeleteAction.make`. A filter spelled the other way would be the only one.
4. **The base class already carries `.query()` and `.schema()`.** ADR 0024 settled what a base may grow, and both are there — so the difference is not what a filter can do, only how one is spelled into being.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Keep `SchemaFilter.make(name)`, correct the PRD** | The catalogue stays uniform, nothing published moves, and the document says what the code does. | **Kept.** |
| **B. Add `Filter.make()` beside it** | The document becomes true without breaking anything. | Not kept. Two spellings for one thing is the worst of both: a reader meets whichever the example they found used, and neither is wrong enough to correct. And verification 2 says the name has to arrive at construction, so `Filter.make()` would be a filter that is not yet a filter. |
| **C. Rename the six to `Filter.make().ternary()` and so on** | The document becomes true and the API is consistent with itself. | Not kept. It makes the base class a factory for its own subclasses, which inverts what ADR 0024 settled, and it moves every filter anybody has written for a document line rather than for a reason. |

## Decision

**1. A filter is made from the class it is.** `SchemaFilter.make(name)`, like every other filter, field, column and action in the framework. The base class stays abstract and gains no `make`.

**2. The name is given at construction and is not optional.** It is what keys the filter, what the boot refuses duplicates by, and what a request names. A spelling that allows a filter to exist before it has one allows a filter nothing can reach.

**3. PRD 07 §4 is corrected to the shipped spelling.** The document was written before the catalogue existed and describes a shape that was never built; it is the document that moves.

## Consequences

- **The catalogue reads one way throughout.** Somebody who has written a field knows how to write a filter without being told.
- **`Filter` stays a base class rather than an entry point.** Anything it grows is for every filter, which is what ADR 0024 asks of it, and nothing about it invites being called directly.
- **A custom filter is a subclass, not a configured base.** `SchemaFilter` is the one for a free schema, and somebody wanting something else writes a class — which is what the other five are.

## Reopening rule

A filter whose kind is not known when it is made: one chosen by configuration, or by a plugin resolving a name at boot. Decision 1 assumes the class is in hand at the call site, and it would not be.

Nothing else. In particular, matching the PRD's original wording is not a reason — that wording is what this decision corrects.
