# ADR 0019 — What an infolist resolves against

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/nest`, `@perchjs/ui`)

## Context

PRD 09 opens the View page with a claim that reads like a style note and is not one: *"an infolist is **not** a disabled form. It is a distinct component tree, optimized for reading."* The same document then asks for the opposite of a fork — acceptance criterion 4: *the layouts behave identically in a form and in an infolist, one single implementation, tested in both contexts.*

So an infolist shares the layouts, shares the root `Component`, and shares nothing else. What is left to decide is the part with no precedent here: **where an entry's value comes from.**

Every value the panel has handled so far lives in the state map. The client sends it, stage 5 judges it against the tree, the cycle resolves it, and the save writes it back. An entry has no such journey. Nobody types it, nothing validates it, and it is never written. It is read off the record and displayed.

The question is whether that makes it a field with most of its behaviour switched off, or a different thing that happens to sit in the same tree.

## What verification established

1. **A path is a field's privilege.** `walk()` gives a node its path only where `component instanceof Field && component.name !== ""`. Everything else resolves with an empty path, and an empty path is what layouts have.
2. **So is a value on the wire.** `serialise.ts` attaches `path` under the same test. A node that is not a field is serialised as structure and nothing more.
3. **The trust boundary is built from the same test.** `sanitize()` keys its allowlist on `node.component instanceof Field && node.path !== ""`. A tree with no fields therefore admits nothing — not by a rule written for infolists, but because there is nothing in the map to match against.
4. **Relation paths are already solved, for tables.** `path.ts` validates `author.country.name` against the IR with an error naming the segment, turns a set of such paths into one include plan, and reads the value without throwing on an intermediate null. Three jobs, all of them the ones an entry needs, all built and tested.
5. **`view` already exists as an operation and as a policy.** `Operation` is `"create" | "edit" | "view"` and `Authorization.view` is asked per record. What does not exist is a route: the panel serves `:resource`, `:resource/create` and `:resource/:id/edit`.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. `Entry` beside `Field` under `Component`, value read from the record by its path** | The layouts are shared because they are `Component`'s. Nothing an entry has can be persisted, validated or admitted, because none of that machinery looks at anything but a `Field`. The include plan and the value reader are the ones tables already use. | **Kept.** |
| **B. A form with every field `.disabled()`** | Nothing new to build. The View page is the Edit page with a flag. | Not kept. `disabled` is a resolved property of a field that still holds state, still admits, still validates and still dehydrates — four behaviours that would each need a second exception, in the four files that must stay boring. And it caps what a read-only view can do at what an input can do: no badge, no money, no copy button. |
| **C. `Entry extends Field`, with `.dehydrated(false)`** | Reuses the path, the value and the serialisation as they stand. | Not kept. It inherits `rules`, `live`, `afterStateUpdated`, `toStorage` and `acceptsClient` — every one of them meaningless on an entry and every one of them reachable. A builder that offers `.required()` on something nobody fills is a declaration nothing acts on, which is the fault this repository spends the most effort catching. |
| **D. Entries carry their own value in the state map** | One map, one shape, one thing for the renderer to read. | Not kept. It puts a value nobody may send into the map stage 5 checks *incoming* values against, so the one file whose whole job is refusing what was not declared would start holding things that are declared and still must never be accepted. |

## Decision

**1. `Entry` extends `Component`, not `Field`.** Layouts, visibility, labels, helper text and column spans come from `Component` and are the same objects a form uses. Nothing else is shared.

**2. An entry's name is a path into the record, not into the state.** They look alike and mean different things: `TextInput.make("title")` names where a value lives while the reader edits it, `TextEntry.make("customer.email")` names where a value lives in the row. The second is the path language `path.ts` already validates against the IR, with the same depth cap and the same errors.

**3. The value is read at resolution time and never enters the state map.** An infolist resolves against the record. The state map stays what it is — the thing a client may send and stage 5 must judge — and an infolist never adds to it.

That is what makes PRD 09's second invariant hold without a rule of its own: an entry that authorization removed is not in the resolved tree, so its value is never read, so it cannot be in the payload. Hiding it on the client was never an option because it was never sent.

**4. An infolist makes no round trip.** There is no state to send back, so there is no `/state` for a View page: the tree is resolved once, serialised once, and rendered. A resolver on an entry is evaluated at that moment and not again.

**5. Relations are loaded from the entry paths, in one plan.** The same `buildIncludePlan` the table builds from its columns, over the paths the entries declare. A View page costs its own query and the relations it names, and never one per row.

## Consequences

- The View page is a render, not a cycle. Nothing on it can depend on something the reader does, and that is the whole point: the moment one does, it is a form.
- `RepeatableEntry` reads a loaded relation rather than seeding rows. It has no keys, no order to hold and nothing to write, so none of ADR 0018 applies to it.
- Two path languages now exist side by side — the state path a field owns and the record path a column and an entry share. They are told apart by what declares them, not by their shape, and nothing may convert one into the other.
- An entry cannot be made writable later without becoming a field. That is intended.

## Reopening rule

A read-only view that must react to the reader without becoming a form — a filter over a `RepeatableEntry`, a disclosure that fetches. That is a round trip on a tree with no state, which decision 4 says does not exist, and it would reopen decisions 3 and 4 together.

Nothing else does. In particular, an entry catalogue that grows, or a formatting option a field also has, is not a reason to merge the two hierarchies: sharing a formatter is a shared function, not a shared base class.
