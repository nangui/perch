---
title: TextColumn
---

# TextColumn

A value read as the words it is. The column most tables are mostly made of.

```ts
import { Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make().columns([
      TextColumn.make("title").label("Title").searchable().sortable(),
      TextColumn.make("author.name").label("Author"),
    ]);
  }
}
```

## Sorting and searching are declared, not offered

Neither is on by default, and neither is something the client may ask for unasked.
Ordering by a column reveals the order of its values, and asking whether any row matches
`@acme.com` answers a question about values nobody displayed. Both are oracles, so the
server accepts them only where a column said so.

That is why `.sortable()` and `.searchable()` read as permissions rather than as
decorations. The button appearing in the heading is the visible half; the server agreeing
to act on it is the half that matters.

## A relation costs nothing extra

`author.name` is a path through a relation, and it does not become a query per row. Every
relation a column reads is folded into one `include` on the page's single query, so a
table of two hundred rows showing an author each is still one query.

## Reading a value rather than showing it

A stored timestamp is an instant and an amount is a number. Neither is what a reader
wants to see.

```ts
import { Table, TextColumn } from "@perchjs/core";

Table.make().columns([
  TextColumn.make("seenAt").label("Seen").dateTime({ timezone: "Europe/Paris" }),
  TextColumn.make("total").money("EUR"),
  TextColumn.make("count").numeric({ decimals: 0 }),
]);
```

The rule is declared here and applied in the browser, which is the whole point. Which
wall clock a timestamp is read against and which currency an amount is in are decisions
somebody makes once; how a date reads and where the thousands separator falls belong to
whoever is looking. One answer is read by several people, and each of them is owed their
own.

A value the rule does not fit is shown as it stands. A word under a rule that says date
stays that word, because hiding it would take away the one place anybody could notice.

These are the same three [TextEntry](../infolists) declares, applied by the same
function. A panel where a date reads one way on a record and another in the list of them
is a panel nobody trusts about either.

## Keeping a column from a reader

```ts
import { Table, TextColumn } from "@perchjs/core";

Table.make().columns([
  TextColumn.make("name"),
  TextColumn.make("salary").visible(
    (user) => (user as { role?: string } | undefined)?.role === "admin",
  ),
]);
```

Not the same as taking it off, and the difference is the whole reason it exists. A
column the reader turned off is a column whose values were read, sent and are sitting in
the page. One refused here is not in their table at all: its values are not projected out
of the row, not presented and never leave the server. A salary column hidden by styling
is a salary column in the response.

It is not writable either. A cell control the list never offered is not one a request can
ask for afterwards, so a write to that path is refused the way a path no column declares
is refused.

Asked once per request, with the reader, the way the heading's label is decided once for
the table. Per row would be the heading equivalent of N+1, and a column that came and
went down a page is not one anybody can read.

## Taking a column off

```ts
import { Table, TextColumn } from "@perchjs/core";

Table.make().columns([
  TextColumn.make("title").sortable(),
  TextColumn.make("createdAt").label("Created").toggleable(true),
]);
```

`toggleable()` lets the reader turn a column off. The argument is whether it starts off:
`true` is for the column worth having and not worth the width, such as a created-at
beside six others. It starts hidden and a reader turns it on, rather than starting visible and being
turned off by everybody.
