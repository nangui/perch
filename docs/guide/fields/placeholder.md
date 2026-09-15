---
title: Placeholder
---

# Placeholder

Something to read, and nothing to save.

```ts
import { Placeholder, Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Invoice" })
export class InvoicesResource implements PanelResource {
  form() {
    return Schema.make([
      TextInput.make("amount").numeric(0.01),
      Placeholder.make("withTax")
        .label("With tax")
        .content(({ get }) => `${(Number(get("amount") ?? 0) * 1.2).toFixed(2)} €`),
    ]);
  }
}
```

A computed line in the middle of a form: the total of what is above it, when a row was
last written, which of two prices applies. It holds no state a client may set and writes
nothing to the database, which makes it the one field in the catalogue that is purely an
answer.

## It is recomputed, not filled in once

`.content()` takes a resolver and runs on every pass. A line that reads another field has
to be recomputed when that field changes, which is why it is not hydrated once and kept.

That also means the field it reads needs `.live()`, exactly as a dependent `Select` would:
the round trip is what re-resolves the tree, and nothing happens without one.

## Placeholder or a disabled input

A disabled input is a control. It has a value, it looks like something that could be
typed into, and a reader who sees one wonders what would enable it.

A placeholder is a sentence. Use it when the answer is not a value the form holds, and
use a disabled field when it is one the form holds and this reader may not change.
