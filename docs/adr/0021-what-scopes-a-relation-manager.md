# ADR 0021 — What scopes a relation manager

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/nest`, `@perchjs/prisma`, `@perchjs/ui`)

## Context

A relation manager manages a record's children beside it: its own table, its own pagination, its own actions. PRD 05 §5 calls it *the feature that separates a real admin from a toy CRUD*, and it draws the distinction that matters — a `Repeater` edits children **inside** the parent form and in one transaction; a manager works **alongside**, one operation at a time.

That is where the question lives. A repeater's writes are nested under the parent, so the parent is the scope by construction. A manager reads and writes the child model directly, so something has to say *which* children — on every read, every create, every action. Get it from the wrong place and a reader edits somebody else's rows.

## What verification established

1. **The parent side of a to-many carries nothing to scope by.** Read off the generated IR: `Post.comments` has `foreignKeyFields: []` and `referencedFields: []`. Prisma records the columns on the side that owns them, and the parent is not that side.
2. **The child side carries them.** `Comment.post` has `foreignKeyFields: ["postId"]`, `referencedFields: ["id"]`. So the scope of `Post.comments` is derivable, but only by looking at the *other* model's inverse relation.
3. **Nothing in the panel does that today.** No route, no builder and no type mentions a relation manager; the repeater is the only thing that has ever written a child, and it does it nested.
4. **The pieces a manager needs already exist and are not scoped.** `readList` builds a query from a table and a query string, `loadSelection` reads the rows an action names, and the save controller writes one record. Each takes a model and knows nothing about a parent.
5. **A to-many with no owning column is a real shape.** A many-to-many is a to-many on both sides with no foreign key on either — the join table is Prisma's, and neither model has a column to compare.

## Options

Where the scope comes from is the whole decision.

| | What it gives | Kept or not |
|---|---|---|
| **A. From the address** — the parent's key is a path segment, and the server derives the column from the IR | The scope is a thing the server read, and the same thing that decided whether the reader may be here at all. | **Kept.** |
| **B. From the request body** — the client sends the parent key alongside what it is writing | Simple, and the client already knows it. | Not kept. It is the one value that must not be the client's: a body naming a different parent is a body that edits somebody else's children, and no validation of the child can catch it because the child is perfectly valid. |
| **C. From a clause the manager declares** — the author writes the filter | Explicit, and no derivation to get wrong. | Not kept. It is the same value written twice, and the copy that drifts is the one that stops constraining. Verification 2 says the IR already holds it. |

## Decision

**1. A manager is reached through its parent, and the parent's key is in the address.** Nothing about the scope is read from a body. A request that names a parent the reader may not see is refused before the relation is looked at.

**2. The scope is derived from the IR, on the child's side.** The manager names a to-many on the parent; the server finds the inverse to-one on the target model and takes its foreign key. That derivation is done once, at boot.

**3. A derivation that is not unique stops the boot.** Two relations from the child back to the parent, or none, means the server would have to guess which column scopes the manager — and the wrong guess is a page of somebody else's rows. This is the same reading as every other declaration here: what cannot be honoured is refused loudly, at the one moment somebody is watching.

**4. A create sets the foreign key, and the form may not.** The column that says which parent a child belongs to is the server's to fill from the address. It is excluded from the manager's form the way a tombstone is excluded from an inferred one — a field that could reassign a child to another parent is a field that would.

**5. A manager carries its own authorization, and does not borrow the child resource's.** Reaching one at all requires being allowed to view the parent. What it may then do is its own policy's to say.

Borrowing would be worse than either: the same child model is managed differently under different parents, so a policy written for the child's own page would silently take effect in a place its author never looked at.

**6. A many-to-many attaches and detaches; it does not create and delete.** Verification 5 is why it is a different verb set rather than a flag: there is no column to fill, so there is nothing for decision 4 to do. A row exists on its own and is joined, or it is not.

## Consequences

- **Every read and write in a manager is scoped by one derived column**, which means the derivation is a security boundary and not a convenience. It gets the treatment: derived at boot, refused when ambiguous, and never taken from a request.
- **The child may also be a resource of its own**, with its own pages and its own policy, and the two do not consult each other. That is intended and it is the thing to check first when a permission surprises somebody.
- **Managers render as tabs under the form**, which is what the layout that just landed is for. Free placement waits for page structure to become a schema.
- **A manager's table is a `Table`**, so sorting, filtering, searching and the include plan are the ones the list page already has. What is new is the scope, not the reading.

## Reopening rule

A relation whose scope is not a column: a polymorphic child, or one reached through a join model the panel must treat as a first-class row. Decision 2 derives a column and there would be none, so the derivation and decision 3's refusal would both have to be reopened.

Nothing else. In particular, wanting the parent key in the body for convenience is not a reason — it is the one value the request must not carry.
