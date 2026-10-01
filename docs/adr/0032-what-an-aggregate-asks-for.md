# ADR 0032 — What an aggregate asks for

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/prisma`, `@perchjs/testing`)

## Context

Three things in the v0.3 tier need a number the database computes rather than one read off a row: a widget's stat (PRD 09 §3.1), a table's footer summary (PRD 07 §8), and a column that counts or sums a relation (PRD 07 §4). The port has no way to ask for any of them.

PRD 09 §6 names the consequence as its only Critical risk: *"Widget aggregates ignore tenant scoping"*, with the mitigation *"scoping at `DataAdapter` level (PRD 04 §8), never in the widget"*. A widget that cannot ask the port is a widget that holds the client and asks the database, which puts the panel's most aggregate-heavy screen outside the one boundary PRD 04 §8 relies on. The order is the reason this record comes first: the shape of the question is settled before four widget types are published teaching people to ask it another way.

What has to be settled is not whether the port aggregates. It is **what one aggregate asks for** — over which rows, against which columns, how many at a time, and what comes back when there are no rows at all.

## What verification established

1. **No aggregate exists on the port.** `DataAdapter` declares twelve methods and none of them aggregates. The one row count the tree performs is private, inside `PrismaDataAdapter.findMany`, filling `Page.total`, and nothing can ask for another.

2. **The narrowing is already separable, by accident rather than by declaration.** `whereOf(query: Query)` in the Prisma adapter reads `clauses`, `search` and `joinedTo`, and nothing else — not `sort`, not `skip`, not `take`, not `include`. The half of a `Query` that decides *which rows* is therefore already a self-contained thing that nothing has named.

3. **The three consumers are not one shape.** A footer summary and a widget stat are the same question: one value over the rows a filter kept. An aggregate column is a different one — per row, over a relation — and PRD 07 §4 requires it *"translated into subqueries, never into an application loop"*, which makes it part of the read rather than a call of its own. A chart series and a group count are a third: they need a `by`, and everything that arrives with it, which is how a date is bucketed, how groups are ordered, and what happens at high cardinality.

4. **Five function names are not five legal operations.** `sum` and `avg` are defined for numeric columns and nothing else, which Prisma 7's generated input type already refuses. `min` and `max` are defined for considerably more than a panel has a use for, and the adapter's own typing admits every scalar, so what they accept here is this project's to narrow rather than the database's to refuse. `count` takes any column, and naming one counts the rows it is not null on. The IR carries the type of every column, so whichever rule is chosen is answerable before a request arrives rather than when one does.

5. **An empty set is not a zero.** `count` over no rows answers 0; `sum`, `avg`, `min` and `max` answer null. A footer printing 0 for a filter nothing matched states a total that was never computed.

6. **Two column types cannot answer a `number` honestly.** Over `Decimal`, the database's sum and average are exact and a JavaScript number is not. Over `BigInt`, a total past `Number.MAX_SAFE_INTEGER` raises rather than rounding. Both are types a panel sums — money, and keys — and neither survives the obvious return type.

7. **The mitigation PRD 09 §6 points at is a sentence, not a mechanism.** `AsyncLocalStorage` is named in ARCH 12 and in PRD 04 §8 and appears in no source file; `tenantScoped` appears in none either. This record does not build tenancy. It builds the place tenancy has to reach, which is the half that can be built first.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. One method per function** — `count`, `sum`, `avg`, `min`, `max` | Each signature says exactly what it returns. | Not kept. A footer showing a count, a total, an average and a range is five round trips for four numbers over one set of rows, and the five can disagree if a row is written between them. |
| **B. One call carrying named aggregations** | One query, one set of rows, several answers. | **Kept.** |
| **C. Reuse `Query` and ignore its paging half** | Nothing new to declare. | Not kept. The port would have to state what a `take` does to an aggregate, and both answers are traps: honouring it aggregates a page, ignoring it accepts an argument that does nothing. |
| **D. Let a widget hold the client** | Nothing to build. | Not kept. It is the Critical risk in PRD 09 §6, adopted as the design. |

## Decision

**1. The narrowing becomes a thing with a name.** `Narrowing` carries `model`, `clauses`, `deleted`, `search` and `joinedTo`. `Query` extends it with `sort`, `skip`, `take` and `include`; `AggregateQuery` extends it with the aggregations. A summary cannot see rows its page did not, because there is one declaration of which rows and both read it. Verification 2 is why this costs nothing — the adapter's `where` builder already took only that half — and `Query`'s shape does not change, so nothing that builds one notices.

**2. One call, several named aggregations.** `aggregations` maps a key the caller chooses to `{ fn, path? }`, and the answer maps the same keys to values. What the port promises is one call over one set of rows; how few SQL statements that becomes belongs to the adapter, and to the adapter's test rather than to this sentence. Nothing bounds how many aggregations one call may carry, because decision 4 means they come from a resource's own columns and never from a request. The keys belong to the caller because the port has no idea what the caller is drawing.

**3. A path names a scalar column on the model being aggregated, and nothing else.** Not a relation, not a path through one. A relation path is what an aggregate column is for (verification 3), and a to-many has no single value to aggregate.

**4. The function and the path come from the declaration. Only the narrowing's values come from outside.** This is `Clause`'s rule, in the words it is already written in: a request may say which rows, never which column. `sum('salary')` under a filter a reader controls reports a salary one filter at a time, and no check on the value could tell.

**5. What a path admits is checked against the IR, at boot.** The table below is this record's choice and not the database's limit: `min` and `max` reach further than a panel ranges, and what is left out is left out because neither PRD 07 nor PRD 09 asks for it. The refusal is this repository's existing one for a declaration that cannot work: the boot stops, as it does for an unknown icon (ADR 0027) and for a header action that is not a `CreateAction` (ADR 0025). A `sum` of a `DateTime` is not a runtime error to handle, it is a resource written wrong.

| | Admits |
|---|---|
| `count` | any column, or no column at all |
| `sum`, `avg` | `Int` `Float` `Decimal` `BigInt` |
| `min`, `max` | those four, plus `String` and `DateTime` |

An enum needs no row of its own. The generator already resolves one to `String`, on the grounds that it behaves as a constrained string everywhere downstream, so the table counts and ranges an enum column and refuses to sum it, which is what a database would have said anyway.

**6. An empty set answers null, and `count` answers 0.** Verification 5. Null is in the type for every key, and the one function that never answers it is written down rather than typed apart: a result whose shape depends on its own `fn` is a mapped type every caller carries, for a null nobody has to handle. The type therefore does not hold this one; the contract does, which is where an adapter answering 0 over no rows gets caught.

**7. Precision is kept by widening the answer, not by rounding it.** `AggregateValue` is `number | string | Date | null` — a number for `Int` and `Float`, a string for `Decimal` and `BigInt`, a `Date` for the `min` and `max` of a `DateTime`, null for an empty set. Verification 6 is why the string is there. A caller wanting arithmetic over money does it where the precision rules are known, which is not inside the port.

**8. Deletion reaches an aggregate the way it reaches a read.** The liveness filter `findMany` applies is applied here too, from the same `deleted` field on the same `Narrowing`. ADR 0020 settled that reads exclude marked rows at every depth; a footer counting tombstones the page above it hides is that bug one level down.

**9. Grouping is deliberately not here.** No `by`, no `having`, no series. Verification 3's third shape is a second decision, and the port is expected to grow once more for it. Saying so is the point: a reader who finds no grouping should learn here that it was left out rather than forgotten.

## Consequences

- **`DataAdapter` gains a required method, and that is a breaking change** for any adapter implemented outside this tree. Before 1.0 a minor carries it, which is ADR 0008's second decision, and the upgrade guide says so. Required rather than optional on purpose: a port with optional halves is two ports, and a widget whose adapter happened not to aggregate would fail at its first render instead of at compile time.
- **The widget work gets smaller and the leak gets harder.** A stat becomes a port call. A widget still *can* hold a client, because nothing in TypeScript stops it, but it no longer has to — which is the whole difference between a documented rule and an escape hatch nobody needs.
- **Tenancy has somewhere to go.** When PRD 04 §8 is built, one scoping point covers the dashboard, the footers and the pages at once, because all three ask through the same `Narrowing`.
- **The contract in `@perchjs/testing` grows**, which is what it is for. An adapter answering 0 where null is owed, or quietly losing the fraction of a `Decimal`, fails the contract rather than a reader's trust.
- **The counts and the index move**, because both are guarded rather than remembered.
- **What this does not do:** it scopes nothing to a tenant, adds no widget, and groups nothing. It is the port, and only the port.

## Reopening rule

**One:** a consumer appears needing an aggregate over rows a `Narrowing` cannot name — a window, a `having`, an aggregate of an aggregate. Then decision 1 shares the wrong unit, and a record supersedes this one.

**Two:** grouping arrives and its shape subsumes this one, a `by` with no keys answering exactly what decision 2 answers. Then two methods stand where one would do, and the later record collapses them.

**Three:** a database this port exists to make possible cannot answer several aggregations in one query. Then decision 2 is paying a round trip per adapter rather than per call, and option A is worth re-pricing.

Does not reopen this: wanting `sum` over a relation path. That is an aggregate column, it is in PRD 07 §4, and decision 3 points at it by name.
