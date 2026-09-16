---
title: GaugeColumn
---

# GaugeColumn

A number read as a length rather than as digits.

```ts
import { GaugeColumn, Schema, Table, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Account" })
export class AccountsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("name")]);
  }

  table() {
    return Table.make().columns([
      GaugeColumn.make("usage").label("Quota").range(0, 100).sortable(),
    ]);
  }
}
```

For a proportion: a score, a quota, a completion. Down a page of rows, digits have to be
compared one against another and bars do not. A reader sees which is short without
reading any of them.

## Both ends, or neither

`range()` takes the low end and the high end together rather than as two methods. A gauge
with one end is a bar whose length nobody can defend, and taking them at once is what
stops one being declared without the other.

## The bar is worked out in the browser

Which is neither a rule nor state: it is where the value falls between two ends the
server declared. What the server keeps and sends is the number.
