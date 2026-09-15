---
title: Infolists
---

# Infolists

What the View page shows: a record, read-only.

```ts
import { Schema, TextEntry, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title")]);
  }

  infolist() {
    return Schema.make([
      TextEntry.make("title").label("Title"),
      TextEntry.make("author.name").label("Author"),
      TextEntry.make("publishedAt").dateTime(),
    ]);
  }
}
```

Declaring one is what decides a resource has a View page at all. Without it, that route
answers 404 the way one belonging to a resource that does not exist would: there is
nothing read-only to show, and a form with its boxes greyed out would be a different
promise.

## An entry is not a field

They sit in the same tree and they are not the same thing.

An entry holds no state, admits nothing, validates nothing and is never written. It names
a place in the record and shows what is there. Everything a field carries, rules, `live`,
the hooks, the conversion on the way to storage, is not switched off for entries: it is
out of reach, because an entry is not built on a field at all.

That is why putting a `TextInput` in an infolist stops the boot. It is not a lint rule.
The tree would carry something that admits values on a page that has nothing to save
them with.

The layouts are shared, because those belong to the component both are built on:
`Section`, `Fieldset`, `Grid`, `Tabs` and `Callout` work here exactly as they do in a
form.

## Relations

A dotted path reaches through a relation, and the relations an infolist names are loaded
with the record in its own query. A View page costs what a page costs, not what a page
times its relations costs.

## The entries

```ts
import {
  ColorEntry,
  IconEntry,
  ImageEntry,
  KeyValueEntry,
  Schema,
  TextEntry,
  TextInput,
} from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("name")]);
  }

  infolist() {
    return Schema.make([
      TextEntry.make("name").copyable(),
      TextEntry.make("email").url((value) => `mailto:${String(value)}`),
      TextEntry.make("balance").money("EUR"),
      TextEntry.make("status").badge().color("success"),
      IconEntry.make("verified").boolean(),
      ImageEntry.make("avatar").disk("faces").circular().size(48),
      ColorEntry.make("tint").copyable(),
      KeyValueEntry.make("settings").keyLabel("Setting").valueLabel("Value"),
    ]);
  }
}
```

`TextEntry` does most of the work: `.dateTime()`, `.numeric()`, `.money()`, `.badge()`,
`.color()`, `.limit()`, `.copyable()` and `.url()`.

`IconEntry` draws a mark instead of a word, from a boolean or from a map of values to
marks. `ImageEntry` turns stored keys into addresses the host minted. `ColorEntry` shows
the patch and the notation that made it. `KeyValueEntry` shows a `Json` column as the
table of pairs it holds.

Each has a page of its own, and those are being written.

## Rows of a relation

```ts
import { RepeatableEntry, Schema, TextEntry, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Invoice" })
export class InvoicesResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("reference")]);
  }

  infolist() {
    return Schema.make([
      TextEntry.make("reference"),
      RepeatableEntry.make("lines").schema([
        TextEntry.make("description"),
        TextEntry.make("amount").money("EUR"),
      ]),
    ]);
  }
}
```

A repeater that only reads. Its name is the relation on the record, and the entries
inside it name paths on **one of its rows**, not on the thing that holds them.

It is simpler than a form's repeater because it has to be. There is nothing here a client
may send, so none of the addressing a writable repeater must get right arises: no row
key, no membership to keep, nothing to add or remove.

## What never crosses

An entry a policy hides is absent from the payload, not present and marked. Hiding it in
the browser would mean it had already been sent, and a payload is a thing anybody can
read.

The same holds for the value behind a picture. What a row keeps is a key on a disk, and
what crosses is the address the host minted from it: the key says where this application
keeps its files, and a browser has no use for that.
