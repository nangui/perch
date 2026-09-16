---
title: ToggleColumn
---

# ToggleColumn

A switch in a cell. The reader changes the row without leaving the list.

```ts
import { Schema, Table, TextInput, Toggle, ToggleColumn } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title"), Toggle.make("published")]);
  }

  table() {
    return Table.make().columns([ToggleColumn.make("published").label("Live")]);
  }
}
```

## The write is a form save of one field

Nothing about the value is decided here. Flipping the switch saves that one field through
the form, so every rule the value has to keep is the form's and is asked there.

A table that validated its own way would be a second boundary, and two boundaries are two
answers waiting to differ.

## It only fits a field that holds two values

The column asks the **field** at that path whether it can carry a boolean. It does not
match on a list of classes. A chain of `instanceof` is a chain every new field type has
to be added to, and nothing would remind anybody.

Put `ToggleColumn` over a text field and the panel refuses at boot rather than offering a
switch that cannot save.

## There is no cell without a field

If `published` is not in `form()`, the panel refuses at boot. It is refused rather than
drawn, because a cell written through a form that has no such field would drop the value
in silence, which is the worst of the three possible outcomes.

The boot refuses a third case for the same reason: a control over a field no client may
set, where the write would be turned away before anything read it.
