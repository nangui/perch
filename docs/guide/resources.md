---
title: Resources
---

# Resources

A resource is a class that describes one Prisma model's CRUD. It says what the form
holds, what the table shows, and who may do what, and the panel serves the pages from
that.

```ts
import { Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("name").required()]);
  }

  table() {
    return Table.make().columns([TextColumn.make("name").label("Name")]);
  }
}
```

Then list it, and the panel does the rest:

```ts
import { Module } from "@nestjs/common";
import { PanelModule } from "@perchjs/nest";

@Module({
  imports: [
    PanelModule.forRoot({
      path: "/admin",
      resources: [PersonResource],
      dataAdapter: AppDataAdapter,
    }),
  ],
})
export class AppModule {}
```

## The decorator

`model` is the only thing it needs. Everything else has a default worth knowing, because
the defaults are what you read on the screen.

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({
  model: "Person",
  // The URL segment. Left out, it is the kebab-case plural of the model name,
  // and the plural is mechanical: `Person` becomes `persons`. Say it when the
  // language disagrees with the machine.
  slug: "people",
  // One of them, and several. `Person` and `Persons` by default: same
  // mechanism, same reason to override it.
  label: "Person",
  pluralLabel: "People",
  // Where it sits in the menu. Items with no group come first.
  navigationGroup: "Directory",
  navigationSort: 10,
  // One of the panel's own marks, refused at start-up if it has no drawing.
  icon: "users",
})
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("name")]);
  }
}
```

Every field and every column is checked against the representation the generator wrote.
One naming a column the model does not have stops the boot, with the name of the field
and the columns that are there, rather than a form that draws, saves, and refuses the
row whole.

## What the panel generates

Four pages, at the resource's slug, which is `people` in the resource above:

| Page | Route | Exists when |
|---|---|---|
| List | `{path}/people` | always |
| Create | `{path}/people/create` | always |
| Edit | `{path}/people/1/edit` | always |
| View | `{path}/people/1` | the resource declares an `infolist()` |

A resource with no `infolist()` answers 404 at the View route, the way one that does not
exist would. That is deliberate: there is nothing read-only to show, and a page that
showed the form with the boxes greyed out would be a different promise.

## `form()`

One method serves Create and Edit. Which one is happening is in the resolver context, so
a field that only makes sense on one of them can say so:

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      TextInput.make("email").required(),
      // Set once, on the way in, and never offered again.
      TextInput.make("password")
        .password()
        .required()
        .visible(({ operation }) => operation === "create"),
    ]);
  }
}
```

It is rebuilt on every request. Builders are immutable and a tree is never cached between
readers. One that was would be one reader's resolved state shown to another.

## `table()`

Optional. A resource without one still lists: no columns, and the narrow default sort.
With one, it is what the List page draws and what `/records` answers.

```ts
import { Schema, SelectFilter, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  table() {
    return Table.make()
      .columns([
        TextColumn.make("title").label("Title").searchable().sortable(),
        // Through the relation. One `include`, not one query per row.
        TextColumn.make("author.name").label("Author"),
      ])
      .filters([
        SelectFilter.make("status")
          .label("Status")
          .options([
            { value: "live", label: "Live" },
            { value: "draft", label: "Draft" },
          ]),
      ]);
  }
}
```

A relation named by a column becomes part of the page's single query. That is not a
convention you have to keep. It is a blocking test.

## `infolist()`

What the View page reads. Entries, not fields: an entry shows a value and has nothing to
save it with.

```ts
import { Schema, TextEntry, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("name")]);
  }

  infolist() {
    return Schema.make([TextEntry.make("name").label("Name")]);
  }
}
```

Putting a `TextInput` in an infolist stops the boot rather than drawing a box on a page
with nothing to save it.

## `can`, or who may do what

Absent means allowed: the panel already sits behind your guards, and requiring a policy
on every resource would mean writing `() => true` a great many times. It is a debatable
default, so it is written down rather than assumed.

```ts
import { Schema, TextInput } from "@perchjs/core";
import type { Authorization } from "@perchjs/nest";
import { PanelResource } from "@perchjs/nest";

interface User {
  readonly role: string;
  readonly id: number;
}

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  // Named, so a misspelled policy is a compile error rather than a rule
  // nobody calls, which would leave the resource more permissive than
  // whoever wrote it believes.
  can: Authorization = {
    // Gates the resource itself: its routes and its menu entry alike.
    viewAny: (user: unknown) => (user as User).role !== "guest",
    // Asked about one record, so it is asked after the row is loaded.
    view: (user: unknown, record: unknown) =>
      (record as { authorId: number }).authorId === (user as User).id,
    create: (user: unknown) => (user as User).role === "editor",
    update: (user: unknown, record: unknown) =>
      (record as { authorId: number }).authorId === (user as User).id,
    delete: (user: unknown) => (user as User).role === "admin",
  };

  form() {
    return Schema.make([TextInput.make("title")]);
  }
}
```

Three things that are true of all of them:

- **A `viewAny` refusal removes the menu entry *and* protects the routes.** Both halves,
  every time. A hidden link is not a protection, and a protected route with a visible
  link is a button that fails.
- **They are asked on the server, at execution time**, never inferred from what the
  browser was sent.
- **`restore`, `forceDelete` and `viewDeleted` are separate.** Being allowed to hide a
  row is not being allowed to bring one back, and neither is being allowed to leave
  nothing to bring back.

## A count beside the name

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Order" })
export class OrdersResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("reference")]);
  }

  // Handed the principal, for the reason the policy is: a count of rows this
  // reader may not see is a fact about them, one digit at a time.
  async navigationBadge(user: unknown): Promise<string | undefined> {
    const pending = await countPending(user);
    return pending === 0 ? undefined : String(pending);
  }
}
```

Answering `undefined` draws nothing. A resource this reader cannot reach is never asked.

## Shaping what is written

Two hooks, and they are the last thing to touch the data before it goes to the adapter:

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("password").password()]);
  }

  async mutateFormDataBeforeCreate(data: Record<string, unknown>) {
    return { ...data, password: await hash(String(data["password"])) };
  }

  /**
   * The same, for a save, and it does not always receive the whole form. A cell
   * written from the table is a save of one field, so this may be handed the one
   * key that was written. Adding to what arrives is safe; reading a field that
   * was not sent is not.
   */
  async mutateFormDataBeforeSave(data: Record<string, unknown>) {
    return "password" in data
      ? { ...data, password: await hash(String(data["password"])) }
      : data;
  }
}
```

## Shaping what is shown

The third hook, running the other way: the row as it was read, before the Edit form opens
on it.

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("hours").numeric()]);
  }

  mutateFormDataBeforeFill(data: Record<string, unknown>) {
    return { ...data, hours: Number(data["minutes"] ?? 0) / 60 };
  }
}
```

For where a stored shape and an edited shape stop agreeing: a column holding minutes and
a field asking for hours. A form's `default` cannot do this, because `default` is for a
row that does not exist yet.

Two things it is not. It does not change the record: the policies, the relation managers
and everything else asking about the row go on seeing what the database holds. And it is
not a way to put something on the page that the form does not carry, because only the
paths the tree makes visible are serialised.

It is asked on an Edit page and nowhere else. A create has no row to read.

## Being told a row was written

Four hooks that change nothing and are told what happened, for the work that goes
beside a write rather than into it: an index to update, an event to emit, a cache to
drop.

```ts
import type { Row, WriteTree } from "@perchjs/core";
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Order" })
export class OrdersResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("reference")]);
  }

  async afterCreate(record: Row) {
    await orders.place(record);
  }

  async beforeSave(record: Row, data: WriteTree) {
    await orders.amend(record["id"], data.set ?? {});
  }
}
```

`beforeCreate(data)` and `beforeSave(record, data)` run before anything is committed, so
raising in one stops the write. `afterCreate(record)` and `afterSave(record)` run once
there is nothing left to undo: a create commits its uploads before the row and undoes
them if the write fails, and an announcement raising inside that window would delete the
files of a row that exists.

They are told about every save, a cell written from the table included. A cell is a save
of one field, and a resource watching for saves is watching for that one too.

The pair names what arrives: a before hook is handed the write the form produced, which
has already crossed the boundary, so there is nothing in it the client invented.

## Writing the row yourself

The escape hatch. Where the database is not the model, a panel that can only
reach into your tables is a panel you cannot use: the write has to go through the
service or the bus that owns it.

```ts
import type { Row, WriteTree } from "@perchjs/core";
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Order" })
export class OrdersResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("reference")]);
  }

  async handleRecordCreation(data: WriteTree): Promise<Row> {
    return await orders.place(data.set ?? {});
  }

  async handleRecordUpdate(record: Row, data: WriteTree): Promise<Row> {
    return await orders.amend(record["id"], data.set ?? {});
  }
}
```

What arrives is the write the form produced: `set` for the columns, `relations` for
what rides with them, which is where a repeater's rows are.

### Answer with the row, carrying its key

The panel names the row by its key and a create goes to it. A hook that answers with
anything else is refused by name rather than tolerated, because the alternative is a
save that answers with nothing and a reader left on a form that has already been used.

### Every save, including a cell

`handleRecordUpdate` answers for a cell written from the table as much as for the Edit
page. A cell is a save of one field and reaches the database by a path of its own, so a
hook honoured on one route and not the other would write to the database you said you
do not use, on whichever route was forgotten.

### Nothing wraps it in a transaction

The panel's own write is wrapped, because a row and its repeater's rows are one write.
What replaces it may not be a database at all, so wrapping it would promise an
atomicity nothing here can keep. That guarantee becomes yours along with the write.

### The shaping hooks still run

`mutateFormDataBeforeCreate` and `mutateFormDataBeforeSave` come first: they shape the
data, and this receives what they produced.

## Where a create lands

`"edit"`, `"index"` or `"none"`. Set it on the panel for all of them, or on one resource
to override:

```ts
import { Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  // The reader almost always has more to fill in, so stay on the record.
  redirectAfterCreate = "edit" as const;

  form() {
    return Schema.make([TextInput.make("name")]);
  }
}
```

## What else a resource can carry

- **Relation managers** (`relations()`): children edited beside a record rather than
  inside its form, each with its own table and its own actions. A repeater writes its
  rows with the parent in one transaction; these work one operation at a time.
- **Pages of its own** (`pages` on the decorator): statistics for this order, an audit
  trail for this post. A page under the record's address, reached from a strip of links
  the record carries.

Both have pages of their own coming.

## What a resource is not

It is not a place for business logic. A resolver may call a service, which is the whole
reason resources come from the container, but the service is yours and the resource is
the description of a screen. When the two start to blur, the screen is usually the thing
that should move.
