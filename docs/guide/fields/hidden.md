---
title: Hidden
---

# Hidden

A value the reader never sets, and is never shown.

```ts
import type { ResolverContext } from "@perchjs/core";
import { Hidden, Schema, TextInput } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      TextInput.make("title").required(),
      // Carried from the record, or from the default, into the write.
      // `default` takes any value, so a resolver here says what it is handed.
      Hidden.make("tenantId").default(
        ({ user }: ResolverContext) => (user as { tenant: string }).tenant,
      ),
    ]);
  }
}
```

It carries something the server owns through the form and into the write: a tenant, an
author, a slug computed from a title. The value comes from the record or from
`.default()`, and it goes to the database.

## What it does not do

**It accepts nothing from the client.** Whatever arrives at this path is dropped, and not
because a flag says so: the field itself answers that it takes nothing, so there is no
setting to get wrong and nothing to turn off.

"The reader cannot see it" and "the reader cannot set it" are different sentences, and a
form field that reads as the first while meaning neither is the oldest hole in web forms.
An `input type=hidden` is a value sitting in the page, editable by anybody who opens the
inspector, and a framework that read it back would let a reader pick their own tenant.

**It is not disclosed either.** The value never crosses to the browser at all: a form
whose record holds `tenantId` sends a state with no `tenantId` in it. "Hidden" names
where a thing is drawn, never who may read it, and a value riding along in the page
source is a value anybody can read.

Nothing is lost by keeping it back. The server takes it from the row on every pass, which
is also what stops a `.default()` from overwriting a column somebody has already edited.

## Hidden, invisible, or not saved

Three different things, and reaching for the wrong one is how holes are made.

| You want | Use |
|---|---|
| A value the server owns, carried into the write | `Hidden` |
| A field this reader must not see or set at all | `.visible(…)` on the field itself |
| A control drawn, filled in, and never written | `.dehydrated(false)` |

An invisible field is not drawn, not validated and not saved, which is a protection. A
`dehydrated(false)` field is drawn and ignored, which is a convenience. `Hidden` is
neither: it is a value that travels.
