---
title: How the pieces fit
---

# How the pieces fit

Seven packages, and each one is allowed to know about very little. That is the point:
the rules below are enforced by a dependency test that fails the build, not by good
intentions.

| Package | What it does | What it may import |
|---|---|---|
| `@perchjs/core` | the component tree, the resolution cycle, the trust boundary, the wire format | **nothing** |
| `@perchjs/prisma-generator` | reads your schema while `prisma generate` runs, writes the representation | core |
| `@perchjs/prisma` | runs queries from that representation | core |
| `@perchjs/nest` | the module, the routes, the guards, the navigation | core |
| `@perchjs/ui` | the React renderer | core, **types only** |
| `@perchjs/cli` | writes a panel and writes resources | core |
| `@perchjs/testing` | drives a panel the way a browser does | core, nest |

`core` importing nothing is the load-bearing one. It means the engine that decides what
a form holds has no idea that Nest exists, that Prisma exists or that anything is drawn
in React — so the decisions it makes cannot quietly depend on any of them.

## What happens when somebody changes a field

This is the cycle the whole framework is shaped around. A reader picks a country, and a
city list appears.

1. **The browser sends what is in the form**, and the path that just changed. Nothing
   else — it does not send its opinion about what should now be visible, because it has
   none.
2. **The server replays that state against the schema tree.** Every value is checked
   against the field it claims to belong to. A path no field admits, a field that is
   invisible, one that is disabled or read-only: dropped, in silence. Silence on purpose
   — a message saying *which* value was refused is a message that teaches somebody how to
   craft the next one.
3. **The tree is resolved against what survived.** Conditions run, options are computed,
   defaults fill in. All of it here, where the rules were written and where the principal
   is known.
4. **The resolved tree crosses back**, and the browser draws it.

One round trip. The 150 ms budget at the 95th percentile is a blocking test, not an
aspiration.

## What never crosses

An invisible field is not sent, not validated and not saved. A field a reader may not see
is absent from the payload rather than present and marked — hiding it in the browser
would mean it had already been sent, and a payload is a thing anybody can read.

The same holds for an action: a button a policy hides is not a protection, so the
permission is checked again when the action runs. Both halves, every time, because either
one alone is decoration.

## Where the front end comes from

You install `@perchjs/ui`, and the panel serves it. It is a compiled bundle: a renderer,
a component registry and a stylesheet whose colours are custom properties you can
redefine. There is no build to configure and no component to wire up, because the tree it
draws arrives already resolved.

A plugin that needs a component of its own registers it in the browser under its own key,
through the same call the built-in fields use. Nothing in `core` knows that plugins exist
— an extension point the engine has to be told about is an extension point the engine got
wrong.
