---
title: Radio
---

# Radio

One of a few, all of them visible.

```ts
import { Radio, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      Radio.make("visibility").options({
        public: "Anyone with the link",
        team: "People in the team",
        private: "Only me",
      }),
    ]);
  }
}
```

A [Select](/fields/select) hides its choices behind a click and scales to fifty thousand.
A radio group shows every one at once and stops being usable past a handful. That is the
whole difference, and it is why both exist rather than one with a flag: choosing a radio
is a claim about how many there are.

It is also the field that makes three states visible. Where a checkbox cannot tell "said
no" from "never asked", three radios can, because the reader can see which one is filled.

## In a row

```ts
import { Radio, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      Radio.make("size").options({ s: "Small", m: "Medium", l: "Large" }).inline(),
    ]);
  }
}
```

`.inline()` lays the choices in a row. It says nothing about the label: `.inlineLabel()`
is what moves that, on this field and on every other. Two methods rather than one word
meaning both, which is a distinction Filament spent years without.

## Longer labels

The labels are the field. A radio group is the right choice when each option needs a
sentence rather than a word, because every sentence is on the page at once and the reader
compares them without opening anything.

When that stops being true, either the labels are too long or there are too many options,
and the answer to each is a different field.
