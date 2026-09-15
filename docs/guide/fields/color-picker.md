---
title: ColorPicker
---

# ColorPicker

One colour, in the notation the column keeps it in.

```ts
import { ColorPicker, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Brand" })
export class BrandsResource implements PanelResource {
  form() {
    return Schema.make([
      ColorPicker.make("accent").hex(),
    ]);
  }
}
```

## The notation is a storage decision

The page only ever holds hex, because that is what a colour control speaks and what a
reader pastes. The column keeps whichever notation the rest of your system reads.

```ts
import { ColorPicker, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Brand" })
export class BrandsResource implements PanelResource {
  form() {
    return Schema.make([
      // Three columns, three notations, one control.
      ColorPicker.make("accent").hex(),
      ColorPicker.make("background").rgb(),
      ColorPicker.make("highlight").hsl(),
    ]);
  }
}
```

So the conversion happens at the edge, once each way, and the control never has to know
which of the three it is feeding. `.hex()` is the default.

Pick the one the rest of the system already reads. A stylesheet built from these wants
what it wants, and converting at read time in three places is three places to get it
wrong.
