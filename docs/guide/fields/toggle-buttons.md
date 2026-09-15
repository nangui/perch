---
title: ToggleButtons
---

# ToggleButtons

A [Radio](/fields/radio) group wearing buttons.

```ts
import { Schema, ToggleButtons } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      ToggleButtons.make("status").options({
        draft: "Draft",
        review: "In review",
        live: "Live",
      }),
    ]);
  }
}
```

It makes the same claim a radio group makes: every choice is on the page, so there are
few of them and the set is closed. What differs is how much room they ask for and how
hard they are to hit. A row of buttons is one gesture on a phone, where a stack of dots
is a careful one.

That is the whole difference, so it is the whole field. Anything a radio group can hold,
this holds, and the boundary reads it the same way.

## In a row, or joined

```ts
import { Schema, ToggleButtons } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      ToggleButtons.make("size").options({ s: "S", m: "M", l: "L" }).grouped(),
    ]);
  }
}
```

`.inline()` lays them in a row. `.grouped()` joins them into one segmented control, which
is what "one of these" looks like when the choices are two or three words each.

Sharing an edge means standing in a row, so a grouped control is laid out in one whatever
`.inline()` says. That is settled where it is drawn rather than in the builder: a builder
that wrote one method from another would answer differently depending on which was
written first.
