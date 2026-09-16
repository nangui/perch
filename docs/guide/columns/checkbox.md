---
title: CheckboxColumn
---

# CheckboxColumn

The same as [`ToggleColumn`](./toggle), drawn as a box.

```ts
import { Checkbox, CheckboxColumn, Schema, Table, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Task" })
export class TasksResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("title"), Checkbox.make("done")]);
  }

  table() {
    return Table.make().columns([CheckboxColumn.make("done").label("Done")]);
  }
}
```

Everything true of the toggle is true here: the write is a form save of one field, the
rules are the form's, and the column fits only a field that holds two values.

## Which of the two to reach for

A switch reads as turning something on: publishing, enabling, activating. A box reads as
ticking something off: done, checked, approved. Neither is more correct; pick the one
whose verb matches the column, and use the same one down the whole panel.
