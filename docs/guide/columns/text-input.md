---
title: TextInputColumn
---

# TextInputColumn

A line of text, edited where it is read.

```ts
import { Schema, Table, TextInput, TextInputColumn } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Product" })
export class ProductsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("reference")]);
  }

  table() {
    return Table.make().columns([
      TextInputColumn.make("reference").label("Ref"),
    ]);
  }
}
```

For the column somebody retypes twenty times in an afternoon: a title, a reference, a
note.

## Only for a field with no shape of its own

Anything with a shape, such as a date, a colour or a choice, has a field that knows it,
and a cell letting free text into one of those would be writing past the only thing that
understands it.

So the column fits a field that narrows nothing. The question is not "does it take a
string": a stored file key is a string and a colour is a string. It is whether the field
takes a string *and* anything else, which is what a field with no shape does.

## Clearing a cell is allowed here

The empty string is a value this column may write, because clearing a cell is a thing
readers do. Whether nothing is allowed at that path is the field's answer, given by
`required` like everywhere else.
