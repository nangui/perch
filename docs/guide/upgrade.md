---
title: Upgrade
---

# Upgrade

Every `@perchjs/*` package carries the same version number and they are released together,
so an upgrade is one command rather than seven decisions.

```bash
pnpm up "@perchjs/*@0.3.0"
```

**Before 1.0, the minor is the breaking one.** npm reads `^0.2.0` as `>=0.2.0 <0.3.0`, so a
release that asks something of you cannot arrive under an install you already ran. That is
why the tiers land on minors, and it is the reason this page is short: the breaking changes
are collected at the boundary rather than dripped through patches.

This page starts at `0.2`. Going from `0.1` to `0.2` added things and took nothing away,
so there was nothing to do, and a section saying so would be a section about nothing.

## 0.3 to 0.4

Two things, both on the same port, and unlike every change at the last boundary the
compiler sees them. If you have never written a `DataAdapter` of your own, there is
nothing on this page for you.

### An adapter of your own has to be able to aggregate

`DataAdapter` gained a method. `aggregate` takes the same narrowing a `findMany` takes, plus
a set of functions keyed by whatever you are drawing, and answers one value per key:

```ts
import type { Aggregation, AggregateQuery, AggregateResult } from "@perchjs/core";
import type { ModelMeta, Row } from "@perchjs/core";
import { auditAggregations } from "@perchjs/core";

declare const meta: (model: string) => ModelMeta;
/** The rows a page would have listed for this narrowing, and no others. */
declare const narrowed: (query: AggregateQuery) => readonly Row[];
/** Your arithmetic. The rules around it are what this release asks of you. */
declare const worked: (fn: Aggregation["fn"], values: readonly unknown[]) => number;

async function aggregate(query: AggregateQuery): Promise<AggregateResult> {
  // What a column admits is read from the schema rather than left to the
  // database. Some databases will happily sum a boolean, and an adapter that
  // lets them makes the same panel answer differently underneath.
  const complaints = auditAggregations(meta(query.model), query.aggregations);
  if (complaints.length > 0) throw new Error(complaints.map((one) => one.problem).join("; "));

  const rows = narrowed(query);
  const answer: Record<string, number | null> = {};

  for (const [key, one] of Object.entries(query.aggregations)) {
    const path = one.path;
    if (path === undefined) {
      answer[key] = rows.length;
      continue;
    }
    const held = rows
      .map((row) => row[path])
      .filter((value) => value !== null && value !== undefined);

    // Null, not zero, where there was nothing to work over. A zero is a total
    // a reader can see and nobody worked out. A count is the one exception.
    answer[key] = one.fn === "count" ? held.length : held.length === 0 ? null : worked(one.fn, held);
  }
  return answer;
}
```

Required rather than optional, so your adapter stops compiling rather than failing the first
time a page asks it for a total. That is the trade this release makes on purpose.

Two notes that ask nothing of you. The half of a `Query` that decides which rows is now
called `Narrowing`, and `Query` extends it, so anything you wrote that builds or takes a
`Query` is unchanged. And `aggregate` is handed to the callback of `transaction` along with
everything else, because that callback is handed a `DataAdapter`.

If you use the adapter `@perchjs/prisma` ships, you have nothing to do. It implements the
method, in up to two statements per call: a count of rows goes through the route a page
total already used, and everything naming a column goes in one object.

### And it has to be able to group

`DataAdapter` gained a second method, for the same reason and in the same shape.
`groupBy` takes a narrowing and one column, and answers a key and a size per group:

```ts
import type { GroupCount, GroupQuery, GroupKey, ModelMeta, Row } from "@perchjs/core";
import { auditGroupKey } from "@perchjs/core";

declare const meta: (model: string) => ModelMeta;
/** The rows a page would have listed for this narrowing, and no others. */
declare const narrowed: (query: GroupQuery) => readonly Row[];

async function groupBy(query: GroupQuery): Promise<readonly GroupCount[]> {
  const complaints = auditGroupKey(meta(query.model), query.by);
  if (complaints.length > 0) throw new Error(complaints.map((one) => one.problem).join("; "));

  const totals = new Map<string, GroupCount>();
  for (const row of narrowed(query)) {
    const held = row[query.by];
    const key = (held === undefined ? null : held) as GroupKey;
    // Filed by type as well as by value, so a row holding the word "null" and
    // a row holding nothing are two groups rather than one.
    const under = `${typeof key}:${String(key)}`;
    totals.set(under, { key, total: (totals.get(under)?.total ?? 0) + 1 });
  }
  return [...totals.values()];
}
```

Three things it owes, and each is a thing an implementation gets wrong on its own.

The size is every row of the group the narrowing kept, not the part of it the caller is
about to draw. Nothing is capped: what bounds a grouped read is the clause the caller
sends, which for a page is the keys its own rows hold, so a cap here would be a number
picked rather than derived. And rows holding nothing in that column are a group keyed
`null`, not rows left out, because a caller that drew them with no group to put them in
would be showing rows nothing accounts for.

If you use the adapter `@perchjs/prisma` ships, you have nothing to do.

### The contract for adapters asks more than it did

`checkDataAdapter` from `@perchjs/testing` now asks about aggregates as well, and needs
nothing declared for it. A suite of yours that was green may go red, which is the point of
owning a contract.

What it asks: that a count of rows answers what a page answers as its total, that an empty
set answers null rather than zero, that the arithmetic agrees with the rows themselves, that
a marked row is out of an aggregate while it is out of the page, and that a function the
column cannot bear is refused rather than passed along.

What it still does not ask, so that you know where you are on your own: the arithmetic over
a `Decimal` or a `BigInt`, which is where an adapter that rounds quietly would show.

## 0.2 to 0.3

Five things, and the compiler sees none of them. Two are versions the panel now asks of its
host. One stops the boot, loudly and by name, which is how you will find out. The last
changes what a page draws.

### A request that changes something has to say it came from the panel

No action if you use the panel through its own screens. This is for anybody with a client of
their own.

A page on another site can make a reader's browser post to your panel, and the browser sends
their cookies with it. The panel used to accept such a request: a plain HTML form posting
`application/x-www-form-urlencoded` created a row, and one posting `id=1` to a delete action
deleted it. Express parses a form body into the same nested object JSON would have produced,
so the route could not tell the two apart.

A request that changes something now has to be `application/json`, or carry the header
`x-perch-panel`. Neither is available to a form on another page. If you post JSON, which the
panel's own client does everywhere except when it sends a file, nothing changes. If you post
a file from a client of your own, add the header:

```sh
curl -X POST https://example.com/admin/api/posts/upload \
  -H 'x-perch-panel: 1' -F path=cover -F state='{}' -F file=@cover.png
```

A refused request answers 404, which is what every other refusal here answers, and reading
routes are untouched.

### The panel asks for a platform of its own

`@perchjs/nest` takes `@nestjs/platform-express` at `^11.2.6 || ^12.0.0`, where it used to
take any 11.

The upper half is new support. NestJS 12 works, and needs nothing said or done: it publishes
as ESM only, the panel's CommonJS build loads it through Node's own support for doing that,
and both halves of the range are built and tested in this repository's own CI rather than
assumed.

The floor inside 11 is the half that asks something of you. The platform pins its multipart
parser exactly, and the panel's upload route refuses a field name carrying brackets by
handing that parser a limit. A parser older than the one 11.2.6 pins does not refuse that
option, it ignores it, so the refusal quietly does nothing and nothing anywhere says so. The
range is where it says so.

```sh
pnpm up "@nestjs/platform-express@^11.2.6"
```

npm refuses an install that leaves a peer range unsatisfied. pnpm warns and carries on,
so read its warnings once after this upgrade rather than scrolling past them. And if an
override in your own manifest holds the parser below multer 2.2.0, no range can see it.
`perch doctor` can, and names the version it found.

### Node 22.12

`@perchjs/nest` and `@perchjs/testing` ask for Node 22.12 or later, where they asked for 22.
The other five packages still ask for 22.

It follows from the line above. Loading an ES module from CommonJS is what these two do
on NestJS 12, and Node grew that ability in 22.12. On 22.11 the panel does not load at
all, with `ERR_REQUIRE_ESM`. On 22.12 it loads and prints an experimental warning every
time it does. From Node 24 it is silent, which is the quieter place to be.

The floor sits on the package rather than on the combination, so it is asked of an
application on NestJS 11 too, where the platform is CommonJS and nothing needs it. A
manifest has no way to say "only when your platform is ESM", and the alternative is a
floor that is right for most readers and silently wrong for the ones it matters to.

`engines` is a declaration rather than a gate. pnpm installs past one it does not
satisfy without a word, unless you have set `engine-strict`, and what arrives instead of
a refusal is a panel that does not load. That is why this page says it rather than
leaving it to the manifest.

### A resource that offers `ViewAction` has to say how a record reads

`ViewAction` is a link to the record's View page, and that page is the resource's infolist.
A resource that offered the button without declaring one drew a button that answered 404.
Nothing said so: the list looked right, and the reader found out by pressing it.

The boot now refuses it, naming the resource and the action. The same refusal already
applied to `ViewAction.make().inModal()`, which had nothing to open; the link form was let
through on the grounds that its 404 said the same thing. It says it to the one person who
cannot act on it.

If a resource of yours stops booting with a complaint about an `infolist()`, it is this.
Declare one:

```ts
import { Schema, Table, TextColumn, TextEntry, TextInput, ViewAction } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  infolist() {
    return Schema.make([TextEntry.make("title")]);
  }

  table() {
    return Table.make()
      .columns([TextColumn.make("title")])
      .actions([ViewAction.make()]);
  }
}
```

Or drop the action, if a record of that resource is not meant to be read on its own.
Nothing else offers the page, so nothing else has to change.

A relation manager is unaffected. A link in one was already refused, a child having no page
of its own at all.

### An entry with no name of its own now borrows its path

`TextEntry.make("family")` used to draw its value with nothing beside it, while
`TextInput.make("family")` drew `FAMILY` above the box. The same declaration, read two ways.
An entry now falls back to the path it reads, which is what a field in the same position
already did and what a column already did in its heading.

Most pages get better and need no edit. Two cases are worth a look.

An entry you left unnamed on purpose now has a name. Say so explicitly and it stays as it
was:

```ts
import { TextEntry } from "@perchjs/core";

export const quiet = TextEntry.make("headline").label("");
```

An empty string is a name you chose, not the absence of one, so the fallback leaves it
alone.

An entry that reads through a relation shows the path as written, `customer.email` and not
`Email`. That was already true of a field and of a column heading, and the answer is the
same in all three: give it a label.

`RepeatableEntry` is unaffected. Its label is the heading of a group rather than the name of
a value, and nothing that groups invents a heading out of a path.

### Date ranges in the filter bar

No action. A `DateRangeFilter` now takes two cells of the bar instead of one, and its two
boxes sit at their own width inside them. Sharing a single cell squeezed each box under
what a native date control needs, so the browser clipped it and took the calendar button
off the end.
