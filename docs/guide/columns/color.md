---
title: ColorColumn
---

# ColorColumn

A swatch, and the value that made it.

```ts
import { ColorColumn, Schema, Table, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Brand" })
export class BrandsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("name")]);
  }

  table() {
    return Table.make().columns([
      ColorColumn.make("accent").label("Accent").copyable(),
    ]);
  }
}
```

## Whatever notation the column keeps

A colour picker writes `hex`, `rgb()` or `hsl()` depending on what it was told, and a
column over data somebody else filled holds whatever it holds. All of them draw.

What is **not** a colour is shown as the text it is, rather than as an empty swatch. A
swatch of nothing says the row is empty when it is not.

## `copyable()`

Puts a control beside the swatch that copies the value. For the column whose value gets
pasted into a stylesheet rather than read.
