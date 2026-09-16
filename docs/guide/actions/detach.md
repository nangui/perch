---
title: DetachAction
---

# DetachAction

Takes a row off this record, without destroying it.

```ts
import { DetachAction, Schema, Table, TextColumn, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Project" })
export class ProjectsResource implements PanelResource {
  form() {
    return Schema.make([TextInput.make("name")]);
  }

  table() {
    return Table.make()
      .columns([TextColumn.make("name")])
      .actions([DetachAction.make()]);
  }
}
```

## For a relation joined through a table neither model owns

Attaching and detaching are the only two verbs such a relation has. There is no column
for a create to fill and nothing for a delete to remove: the row exists on its own, and
what changes is whether it is joined here.

Putting one on is not an action. It is the relation manager's own control, because
choosing which row to join is a search rather than a button.

## It asks `detach`, its own permission

Not `delete`. Being allowed to put somebody on a project is not being allowed to make a
project, and taking them off it is a long way from destroying one. Asking `delete` here
would refuse the reader who may take somebody off a project but may not delete the
project, which is nearly everybody.
