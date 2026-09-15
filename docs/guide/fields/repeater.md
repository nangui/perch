---
title: Repeater
---

# Repeater

A schema the reader repeats.

```ts
import { Repeater, Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Invoice" })
export class InvoicesResource implements PanelResource {
  form() {
    return Schema.make([
      Repeater.make("lines")
        .relationship("lines")
        .schema([
          TextInput.make("description").required(),
          TextInput.make("amount").numeric(0.01).required(),
        ]),
    ]);
  }
}
```

The rows are written with the parent, in one transaction. That is what separates a
repeater from a relation manager: a repeater is part of this form and saves when it
saves, and a manager is a table beside the record that acts on its own.

## The rows and the key

A repeater's value is not the rows. It is the ordered list of their keys, and that one
value carries both the order and the membership.

You rarely need to know this, except for one thing that follows from it: the key a loaded
row is addressed by has to be right.

```ts
import { Repeater, Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Invoice" })
export class InvoicesResource implements PanelResource {
  form() {
    return Schema.make([
      // `id` unless the model says otherwise.
      Repeater.make("lines").relationship("lines").rowKey("uuid").schema([
        TextInput.make("description"),
      ]),
    ]);
  }
}
```

Getting it wrong is not a small mistake. An update that cannot find its row becomes a
create, so every save duplicates instead of editing. A relation that comes back with rows
and none of this key is an error rather than a shrug, for exactly that reason.

## Naming a row

```ts
import { Repeater, Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Invoice" })
export class InvoicesResource implements PanelResource {
  form() {
    return Schema.make([
      Repeater.make("lines")
        .relationship("lines")
        .itemLabel(({ get }) => String(get("description") ?? "New line"))
        .collapsible()
        .schema([TextInput.make("description")]),
    ]);
  }
}
```

Rows are otherwise told apart by their position, which changes the moment anything is
reordered. `.itemLabel()` is resolved per row, so it can read that row's own fields; give
it a fallback for the moment a row is added and holds nothing yet.

`.collapsible()` is worth having as soon as a row is more than two fields, and worth
having always once the list can get long.

## How many

```ts
import { Repeater, Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Invoice" })
export class InvoicesResource implements PanelResource {
  form() {
    return Schema.make([
      Repeater.make("lines")
        .relationship("lines")
        .minItems(1)
        .maxItems(50)
        .schema([TextInput.make("description")]),
    ]);
  }
}
```

`.required()` here means at least one row, which is what `.minItems(1)` says more
plainly.

## Repeater or relation manager

| | Repeater | Relation manager |
|---|---|---|
| Saves | with the parent, one transaction | on its own, one row at a time |
| Lives | inside the form | in a tab beside the record |
| Suits | a handful of rows that belong to this one | a list that is browsed, filtered, acted on |

Invoice lines are a repeater. A customer's orders are a manager. The question to ask is
whether the rows make sense without the parent in front of you.
