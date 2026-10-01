# ADR 0033 — What a group is, and how many of them a page may ask about

**Status:** accepted · **Scope:** Perch (`@perchjs/core`, `@perchjs/prisma`, `@perchjs/nest`, `@perchjs/ui`)

## Context

ADR 0032 built the aggregate half of the v0.3 table work and left grouping out by name, on the grounds that it is a second shape with its own questions. This is that record.

It also left a rule that this one has to answer rather than step around. ADR 0032's second reopening rule says that if grouping arrives and its shape subsumes the aggregate's — a `by` with no keys answering exactly what one aggregate call answers — then two methods stand where one would do and the later record collapses them. So the first thing to settle is whether there are two methods at all.

The rest is the part a grouping gets wrong quietly. A table grouped by a column with ten thousand distinct values is a page that asks the database for ten thousand rows to draw twenty-five. A count that counts only what is on the page is a group size that changes when somebody turns a page. And a group header reading `7` where it meant a person is a header nobody can use.

## What verification established

1. **The specification is one line.** PRD 07 §8 asks for *"Grouping rows (collapsible groups with counts)"*, and `REF-filament.md` says nothing about grouping at all. Counts, collapsible, and no more: no sums per group, no nesting, no buckets. What is built here is bounded by that rather than by what a grouping could be.

2. **A `by` with no keys does not answer what an aggregate answers.** One aggregate call answers a single object under the caller's own names, because the footer asking it wants four numbers about one set of rows. A grouped read answers one row per group, and by verification 1 each of those rows carries a count and nothing else, so there are no named aggregations for it to carry. Prisma's own two calls have two shapes for the same reason. Folding them would hand the footer, the only caller `aggregate` has, an array of one to unwrap on every list in the panel.

3. **The cardinality problem is not reachable, once what a page needs is stated.** A group header appears where the page's rows cross a boundary, so the groups one page draws are at most as many as its rows. Narrowed to the keys the page holds, the answer is bounded by the page size by construction, and there is no limit for anybody to choose or to get wrong.

4. **Nothing can bucket a date through this port.** Prisma 7's `by` takes scalar field names; truncating a timestamp to a day or a month is `DATE_TRUNC`, which is a raw statement. Grouping a `DateTime` column as it stands gives one group per row, which is not a failure the database reports: it is twenty-five headers of one above twenty-five rows, and a reader cannot tell it from a table that has no groups worth making.

5. **The restriction needs no new vocabulary.** Narrowing a read to the keys a page holds is `{ path, operator: "in", value: keys }`, which `Clause` has expressed since v0.1.

## Options

| | What it gives | Kept or not |
|---|---|---|
| **A. One grouped read over the whole narrowed set** | Every group there is, with its size, so a reader could be shown groups whose rows are further down. | Not kept. It costs a row per distinct value, on the render of every page, and the bound would have to be a number somebody picked. |
| **B. A grouped read narrowed to the keys the page holds** | The headers this page draws, each with the group's whole size, in a read the page size bounds. | **Kept.** |
| **C. Count the groups from the page's rows** | No query at all. | Not kept. A group straddling a page boundary is larger than the part of it on the page, so the number would change as somebody paged through a group they had not left. A count that moves is not a size. |
| **D. Fold it into `aggregate` with a `by`** | One port method instead of two. | Not kept, for verification 2. The record that invited this is answered rather than ignored: the shapes differ in kind, and the condition that would make them one is written into the reopening rule below. |

## Decision

**1. A second method on the port.** `groupBy` takes a `Narrowing` and one path, and answers a key and a total per group. `aggregate` keeps the shape it has, because the two answer differently shaped questions and the footer is not made worse to save a method.

**2. A count, and nothing else per group.** Verification 1. A group that wanted the footer's four would be the thing that makes these one method, and that is the reopening rule rather than a guess here.

**3. One path, not several.** Groups within groups are out. A reader given two levels of collapsing on a table of twenty-five rows has been given a tree to operate instead of a list to read, and PRD 07 asks for neither.

**4. The key is a scalar column on the model, judged against the IR at boot.** The same rule an aggregation's path has, for the same reason: the path is the declaration's and a request may say which rows, never which column.

| | Admits |
|---|---|
| a group's key | `String` `Int` `Float` `Decimal` `BigInt` `Boolean`, and an enum, which the IR carries as a `String` |
| refused | `DateTime`, naming the bucket it would need; `Json` and `Bytes`, which a database will not group |

A `DateTime` is refused rather than allowed to produce one group per row. Verification 4 is why it cannot be served, and a boot that stops is how the person who can fix it finds out.

**5. Null is a group.** Rows holding nothing in that column are one group with a key of null, not rows left out of the table. A grouping that dropped them would hide rows from a list that says it is showing them, which is the worst thing a table can do quietly.

**6. The page is ordered by the group column first, ahead of what the reader asked for.** A group whose rows are scattered down the page is not a group, and a header that appears three times is a header that has stopped meaning anything. What the reader asked for orders within the group.

**7. What crosses the wire is the path and a count per key.** Not the groups' rows: those are the page, already there. The renderer walks the rows it has and opens a header where the key changes, so the client computes nothing except where a boundary is.

## Consequences

- **The port grows a second time, and that is a breaking change for an adapter outside this tree.** The same minor as ADR 0032's method where the two land together, and the upgrade guide says so once rather than twice.
- **A grouped page costs one more read than an ungrouped one**, bounded by the page size and not growing with the row count. It also puts a page past a number already written down: PRD 07 §9 budgets *"SQL queries per page render: **≤ 3** (count + rows + filters)"*, and a page that both groups and summarises is four. The parenthetical enumerates a page that had neither, because that PRD was written before either existed, and a reader meeting the cap will still read it as a cap. This record does not move it. What it owes is saying that the number is now wrong rather than leaving somebody to find out from a guard.
- **Grouping by a relation is not available**, so grouping by an author shows the foreign key rather than the name. That is the gap this record accepts, and it is named rather than left for somebody to discover: the fix is a label pass over the keys, which is a read of its own and a decision of its own.
- **Grouping by a date is not available either**, which is the one a reader is likeliest to want. It is refused at boot with the reason, which is the most this record can honestly do without putting a raw statement behind the port.
- **A collapsed group still arrived.** Collapsing hides rows the client already holds; it does not save a read. A grouping that fetched per group would be the N+1 this project refuses, one level up.

## Reopening rule

**One:** a group needs more than its size — a total, an average, a range, the footer's four per group. Then decisions 1 and 2 are both wrong at once, `aggregate` and `groupBy` are one method with an optional `by`, and the record that replaces this one collapses them. This is ADR 0032's second reopening rule, inherited and made specific.

**Two:** a bucket becomes expressible without a raw statement, by a database feature or by something the adapter can reach. Then decision 4's refusal of `DateTime` is a limitation rather than a decision and should go.

**Three:** a reader needs to see groups whose rows are not on the page, for instance to jump to one. Then option B answers the wrong question and option A has to be re-priced with a bound that is argued rather than picked.

Does not reopen this: wanting group headers to read as names rather than as keys. That is a label pass, it is named in the consequences, and it changes nothing about the shape decided here.
