---
title: SelectColumn
---

# SelectColumn

One of a few, chosen where it is read.

```ts
import { Schema, Select, SelectColumn, Table, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      TextInput.make("title"),
      Select.make("status").options({ draft: "Draft", live: "Live" }),
    ]);
  }

  table() {
    return Table.make().columns([SelectColumn.make("status").label("Status")]);
  }
}
```

## The choices are the field's, never the column's

The column declares no list. One that did would be a second list to keep in step with the
first, and the one that drifted would be the one nobody looked at.

The boundary matches against the **field's** list, so a cell offering anything else would
be offering a value that cannot be saved. Membership is asked once, of the thing that
holds the list, resolves it per request and refuses what is not in it.

## It fits only a list written down

A list that comes from a resolver is a different list per row. A list that comes from a
relationship is a query per row. Both are a page of dropdowns nobody asked for, so the
panel refuses at boot rather than building one.

A field that holds several values is refused too: choosing several is not something one
cell does. So is a field that turns away its own first option, which is not offering a
list at all.

A select in a cell is for the handful of fixed choices: a status, a role. For anything
else, the reader goes to the edit page, where one list is resolved once.

## Nothing is a choice

A reader can set the cell back to empty. A cell that could take a value and never give it
back is a one-way door. Whether the field allows empty is the field's own answer, given
by `required`.
