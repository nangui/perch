---
title: CheckboxList
---

# CheckboxList

Several of a few, all of them visible.

```ts
import { CheckboxList, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      CheckboxList.make("topics").options({
        news: "News",
        guides: "Guides",
        releases: "Releases",
      }),
    ]);
  }
}
```

A [Radio](/fields/radio) with the arithmetic changed: every choice on the page at once,
and any number of them taken. What separates it from a multiple [Select](/fields/select)
is what separates a radio from a single one. A select hides its choices behind a click
and scales; a list of checkboxes shows every one and stops being usable past a handful.
Choosing between them is a claim about how many there are.

## An empty list is an answer

The value is a list, and an empty one means the reader unticked everything. That is a
different fact from never having been asked, and this is the field where the two are
told apart: the boxes are all on the page, visibly unticked.

`.required()` means at least one.

## Laying it out

```ts
import { CheckboxList, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      CheckboxList.make("topics")
        .options({ news: "News", guides: "Guides", releases: "Releases" })
        .columns(3),
    ]);
  }
}
```

`.columns()` runs the choices down columns instead of one long stack. A layout choice,
nothing more.

## Ticking everything at once

```ts
import { CheckboxList, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Role" })
export class RolesResource implements PanelResource {
  form() {
    return Schema.make([
      CheckboxList.make("permissions")
        .options({ read: "Read", write: "Write", delete: "Delete" })
        .bulkToggleable(),
    ]);
  }
}
```

One control that ticks and unticks every choice. It is worth having exactly where the
list is long enough to make ticking twelve boxes tedious, which is the same length at
which this field stops being the right one. Offered rather than assumed, so that the
decision stays with whoever wrote the form.
