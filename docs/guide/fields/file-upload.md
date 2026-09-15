---
title: FileUpload
---

# FileUpload

A handle in the form, bytes in a store.

```ts
import { FileUpload, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Person" })
export class PeopleResource implements PanelResource {
  form() {
    return Schema.make([
      FileUpload.make("avatar").disk("faces").directory("avatars").image(),
    ]);
  }
}
```

## What the column holds

A key the storage adapter issued. Not a path, and not the file's name.

That is a security decision, not a storage convention. A reader who could choose the path
could choose somebody else's, and a name is theirs to pick and therefore theirs to
weaponise. The key is opaque to everything above the adapter, and turning one back into
an address is the adapter's job alone.

## Disks

A disk is a store you declared when you registered the panel. `.disk()` names which one,
and the boot refuses a field naming one that was never declared.

```ts
import { FileUpload, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Invoice" })
export class InvoicesResource implements PanelResource {
  form() {
    return Schema.make([
      // Avatars on one store, invoices on another, without either field
      // knowing what the other is.
      FileUpload.make("pdf").disk("documents").directory("invoices/2026"),
    ]);
  }
}
```

`.directory()` is where committed files land on that disk. Both have defaults: the disk
called `default`, and the root of it.

## Limits are the route's, not the page's

```ts
import { FileUpload, Schema } from "@perchjs/core";
import { PanelResource } from "@perchjs/nest";

@PanelResource({ model: "Post" })
export class PostsResource implements PanelResource {
  form() {
    return Schema.make([
      FileUpload.make("cover")
        .maxSize(2_000_000)
        .acceptedFileTypes(["image/png", "image/jpeg"]),
    ]);
  }
}
```

A file input's `accept` is a filter over a dialog, and a size check in the page is a
courtesy. Both are gone the moment somebody posts to the upload route directly, which is
where these two are actually enforced.

`.image()` is shorthand for the common set, `image/png`, `image/jpeg`, `image/gif` and
`image/webp`, and is no more permissive than naming them. Media types may carry a `*`
subtype: `image/*` accepts any of them.

## What happens when a reader picks a file

Three steps, and the middle one is the reason there are three.

1. **The bytes go up immediately**, into a staging area. The form has not been saved and
   may never be, so a staged file has to be distinguishable from one that belongs.
2. **The save commits it**, moving it to where it belongs and answering its final key.
   This happens before the row is written, so a failure here means no row at all rather
   than a row pointing at nothing.
3. **A failed save removes what it staged**, and a replaced file's predecessor is dropped
   once the new row is in.

## What is left behind

A reader who picks a file and never saves leaves bytes nobody points at. The framework
provides a sweep for those and **does not run it**: a panel does not get to start a timer
in a process it does not own, and three instances behind a load balancer would each start
their own. Scheduling it is yours, and the [deployment guide](/deployment) shows how.

It covers that leftover and, by construction, cannot cover the other one. A file
committed while the row write failed sits in its final place, where no age can tell it
from one that belongs. That is found by comparing the store against the column, or not at
all.
