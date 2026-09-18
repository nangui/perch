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

## A value the row implies and does not hold

```ts
import { Table, TextColumn } from "@perchjs/core";

Table.make().columns([
  TextColumn.make("fullName").value(
    (row) => `${String(row["firstName"])} ${String(row["lastName"])}`,
  ),
]);
```

For a full name from two columns, a word for a pair of flags, a count of days from a
date.

### It is synchronous, and that is the constraint

It runs once per row. A hundred rows is a hundred calls and five hundred is five
hundred. Made to await, it would be a query per row on a page that is otherwise one
query, which is the one thing this design will not have. A value worth a query is a value
the row should be carrying.

### It reads the whole row

Before anything is cut away, so it may read columns this table does not show. Only what
it returns leaves the server: a full name built from two columns nobody displays arrives
as a full name and nothing else.

### It cannot be sorted or searched

Ordering and searching happen in the query, and the query has only the columns the model
has. A value worked out in the application is not one of them. Declaring both is refused
at boot, because the alternative is an error from the database with nothing in the panel
to explain it.

### It cannot be written from the table either

A control over a computed value is a control whose writes vanish. The save lands and the
cell draws what the resolver says again, so the reader watches their own typing undo
itself with nothing anywhere to explain it. Refused at boot for the same reason as the
rest.

### It is called `value`, not `state`

The specification calls it `state`. Here that word is what every component calls its own
declaration, and a column already has one, so the method would have had to displace it.
The name is the only difference.

## Attributes for whoever reads the page from outside

```ts
import { Table, TextColumn } from "@perchjs/core";

Table.make().columns([
  TextColumn.make("reference").extraAttributes({ "data-tour": "reference" }),
]);
```

For a tour that needs to point at a column, a test that needs to find one, a screen
reader that needs a word the value does not carry.

Only attributes that describe: `data-*`, `aria-*`, `title` and `role`. The rest of that
namespace tells a browser to do something, and a table is not the place to be told. The
others are refused at boot, by name.

`data-label` is refused too, and it is not an oversight. It is how a row becomes a stack
on a narrow screen: each cell carries the heading it would have had. A column that took
that name would be unlabelled exactly where the label is the only thing naming it, which
is a bug that never shows on the machine it was written on.

## When the row holds nothing

```ts
import { Table, TextColumn } from "@perchjs/core";

Table.make().columns([
  TextColumn.make("lastSeen").dateTime().placeholder("Never signed in"),
  TextColumn.make("credits").numeric().default(0),
]);
```

A cell with no value draws a dash, which says the column is empty and nothing else.
These two say something better, and they are not the same thing.

`placeholder` is **words**. They are not formatted, they are not what a sort orders by,
and they are not what the row holds. `Never signed in` reads as a fact; a dash reads as a
gap somebody should worry about.

`default` is a **value**, and goes through everything a stored one goes through: a
default of `0` under `numeric` reads as the locale writes zero. It changes what is shown
and nothing else, so a sort still orders by what the database holds. That is the honest
answer and occasionally a surprising one.

Declared together, the default stands in first and the placeholder is only reached if
there is still nothing.

## How much room it takes

```ts
import { Table, TextColumn } from "@perchjs/core";

Table.make().columns([
  TextColumn.make("name").width("12rem"),
  TextColumn.make("total").money("EUR").alignment("end"),
  TextColumn.make("createdAt").dateTime().hideWhenNarrow(),
]);
```

`alignment` takes `start`, `center` or `end`. `end` is what a column of numbers wants,
so the digits line up and two amounts can be compared by their shape rather than read.
They are logical edges rather than left and right, because a panel read right to left
puts the start of a line on the other side, and a column of numbers pinned to the left
there is pinned to the wrong end of the row.

`width` is a request, not an instruction: a table divides what it has, and a column
asking for more than there is gets what is left. Anything that is not a CSS length is
dropped where it is declared rather than written into the page.

`hideWhenNarrow` leaves the column out below the width where a row stops being a row and
becomes a stack. There, eight columns are eight lines to scroll past for the two somebody
came for, and this is how a column says it is not one of the two.

It is a layout decision and not a permission. The value is still read, still sent and
comes back when the window is wider, with nothing fetched again. `visible()` below is the
one that keeps a value from a reader.

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
