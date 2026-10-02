# ADR 0035 — What a row may hold by the time anybody serialises it

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/prisma`, `@perchjs/testing`)

## Context

A table column on a `BigInt` column takes the panel down. The list route and the list page both answer 500, with `TypeError: Do not know how to serialize a BigInt` out of Nest's exception handler, from a declaration nothing questioned: `TextColumn.make(path)` on a column the generator admits as a scalar.

`@perchjs/core` already knows this failure by name. `auditSchema` refuses a component prop that cannot survive `JSON.stringify`, and its comment says why: *"A value that throws there — a structure that refers to itself, a `BigInt` — takes the page down with a stack trace about JSON, from a declaration nothing questioned."* That audit reads a component's declared props. A row's values are not props, and nothing reads them.

## What verification established

1. **It is reachable and it is a 500, measured rather than reasoned.** A row carrying a `bigint`, a column declared on it, through the real routes: both the API route and the list page answer 500 with that TypeError.

2. **`BigInt` is the only scalar in the IR that throws.** Measured on each: `Bytes` serialises as an object keyed by index, which is ugly and not a crash; a Decimal carries a `toJSON` and arrives as an exact string; a `Date` arrives as an ISO string. One type, one problem.

3. **The hazard is not the list's.** Six `findOne` sites outside the listing read a record for the wire: the edit page, the view page, the options route, the cell write, and two more in the page controller. Converting where a list projects its rows would fix one route and leave the others, which is the shape of a fix that reads as done.

4. **A string round-trips.** Against a real PostgreSQL with a real `BigInt` column: `create` accepts `"9007199254740993"` as readily as `9007199254740993n`, stores it exactly, and reads it back as a `bigint`. So a read that answers a string is not half a fix waiting for a write that refuses one.

5. **The IR says which columns are affected.** Every field carries its `ScalarType`, and a relation carries its `targetModel`, so the columns to convert are nameable from the schema and the include plan rather than discoverable by sniffing values at runtime.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. Refuse the declaration at boot** | Nothing crashes, and the complaint names the column. | Not kept. A `BigInt` column is a column somebody has, and a panel that will not show it is a panel that cannot list their table. The crash is ours to fix, not theirs to work around. |
| **B. Convert where each route builds its answer** | Every adapter is covered, whoever wrote it. | Not kept. Verification 3: seven places, and the eighth route somebody adds is a 500 again. |
| **C. Convert in the adapter, named from the IR** | One place, every route, and a conversion that touches only the columns the schema says are affected. | **Kept.** |
| **D. Convert by walking every value** | No schema reading. | Not kept. A walk that recursed into anything object-shaped would turn a `Date` into `{}` and a Decimal into its internals, so it would fix the crash by breaking two things that worked. |

## Decision

**1. A row leaves the adapter with no `bigint` in it.** The columns the IR calls `BigInt` arrive as strings, in a row and in the rows of any relation the include plan loaded, and in a list where the column holds one. `findMany`, `findOne`, `create` and `update` all answer rows, and all four are covered.

This extends what ADR 0032 decided for an aggregate's value to a row's. That record's reasoning was that neither a `Decimal` nor a `BigInt` survives a double; this one's is that a `bigint` does not survive `JSON.stringify`. Two reasons, one answer, and a panel where the sum of a column and the column itself read the same way.

**2. Named from the IR, never sniffed.** Verification 5. The conversion visits the columns a schema says are `BigInt` and nothing else, which is why it cannot damage a `Date` or a Decimal. Option D is what happens when this is left to runtime.

**3. A string, not a number.** A `BigInt` past `Number.MAX_SAFE_INTEGER` is exactly the value a number loses, and a key that lost its last digits is a key that addresses another row. The renderer draws it as text, and a column asking for `numeric` formatting gets a numeric string, which is what that formatter already takes.

**4. The contract asks for it.** `checkDataAdapter` is where "an adapter must" is held rather than remembered, and an adapter written outside this tree gets told rather than discovering it from a reader's 500. Its existing limit applies: it can only ask where the model it is pointed at carries such a column.

**5. Nothing is refused at boot.** No complaint, no audit, no new vocabulary. A `BigInt` column is drawable, sortable and filterable as it always appeared to be.

## Consequences

- **A `BigInt` column reads as a string in a row, and that is visible.** A host comparing a row's value to a number will find it does not match any more. There was no row to compare before this: the request answered 500.
- **A write still takes either.** Verification 4, which is what makes decision 1 a conversion rather than a one-way door.
- **An adapter outside this tree has one more thing to do**, and the contract says so. It is not a breaking change in the compiler's sense, the port's types being unchanged: `Row` held `unknown` values before and after.
- **`Bytes` is left alone and is still ugly.** An index-keyed object crosses the wire where a reader expected bytes. Named here rather than fixed, because it is not a crash and nothing in this project draws one.
- **The sum of a `BigInt` column and the column itself now read the same way**, which was not true between ADR 0032 and this record.

## Reopening rule

**One:** a serialiser with a replacer sits between every route and the wire, so a value that cannot survive is handled once and for all, wherever it came from. Then decision 1 is in the wrong layer and option B's objection has gone.

**Two:** a reader needs arithmetic on a `BigInt` column in the browser. Then a string is the wrong shape for them and the answer is a number plus a documented ceiling, which is a different decision and wants its own record.

Does not reopen this: finding it odd that a number column reads as text. The alternative is a column that cannot be listed, or one listed wrongly past 2^53.
