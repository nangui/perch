---
title: Deployment
---

# Deployment

A panel is part of your application. There is no separate service to run, no front-end
build to configure and nothing of Perch's to deploy on its own. If your NestJS app is
running, the panel is running.

What follows is the short list of things that are true about it in production, and each
one is here because getting it wrong fails in a way that is hard to read.

## The build order is not negotiable

Perch does not ask your database what a model looks like. It reads what the generator
wrote while `prisma generate` ran: the columns, their types, the relations, the unique
constraints. So the generated representation has to exist before your application is
compiled, and it has to be regenerated whenever the schema changes.

```sh
pnpm prisma generate   # writes the Prisma client and the representation
pnpm build             # compiles your application, which imports both
```

A deployment that skips the first step compiles against yesterday's schema, or fails to
compile at all. A deployment that runs it after the build produces an application whose
representation and whose code disagree, which is worse: it starts.

`npx perch doctor` names this one, along with a representation that no longer matches the
schema it came from.

## `node_modules` has to be there

The panel serves the front end out of the installed `@perchjs/ui` package: it resolves
the package at start-up, reads its manifest and serves the hashed files beside it. It
never imports a module of it, and it never bundles it.

Two consequences, both of which bite silently:

- **Do not prune `@perchjs/ui`.** It is a runtime dependency of `@perchjs/nest`, not a
  build-time one. An image that installs with `--prod` keeps it; one that strips it
  because "the front end is already built" removes the front end.
- **Do not compile your application into a single file.** A bundler that inlines
  `node_modules` leaves the panel resolving a package that is no longer on disk.

## All seven packages move together

They share one version number and are released together, and the panel checks it: if
`@perchjs/ui` ships an asset manifest that `@perchjs/nest` does not understand, start-up
fails with a message saying to reinstall. That is deliberate. A version mismatch is a
broken install rather than a combination anybody supports, and failing at start-up is
better than serving a page whose bundle expects something else.

Pin them together, and upgrade them together.

## Caching

The panel already sends the right headers, and a proxy in front of it should pass them
through rather than decide for itself:

| What | Header it sends | Why |
|---|---|---|
| Pages | `cache-control: no-store` | each one embeds one record's resolved state, and a shared cache would hand it to the next visitor |
| Assets | `cache-control: public, max-age=31536000, immutable` | every filename carries a content hash, so a changed file is a different URL |

A CDN in front of the assets is worth having. A CDN in front of the pages is a data leak.

## Behind a reverse proxy

The panel builds every link from the path the request arrived on. Mount it wherever you
like (`setGlobalPrefix`, a path on a shared domain, a subdomain) and the links come out
right, because nothing is hardcoded.

What breaks that is a proxy that **strips a prefix without telling the application**. If
`https://example.com/tools/admin/people` reaches Nest as `/people`, the panel will build
its links from `/people` and every one of them will be wrong. Either forward the full
path, or mount the panel at the path the outside world uses.

## What Perch needs from the environment

Nothing of its own. It opens no connection, owns no pool, reads no environment variable
and holds no secret. The adapter you wrote takes your client, and your client reads your
configuration. If `DATABASE_URL` is set for your application, it is set for the panel.

The same goes for authentication: the guards you passed to `forRoot` are your
application's, and whatever session or token scheme they read is the one the panel uses.
There is no second login and no second cookie.

## Uploads

A `FileUpload` field writes through a disk you declared, and a disk is an object with
your own storage behind it. In production that means the same thing it means everywhere
else in your application: the bucket credentials are yours, the lifecycle is yours, and
Perch stores the key that comes back.

The disk's `url` has to be reachable **by the browser**, not only by the server. A signed
URL that expires in sixty seconds will expire while somebody is reading the page.

### Somebody has to schedule the sweep

A reader who chooses a file and never saves the form leaves bytes nobody points at. The
framework provides the sweep; **it does not run it.** A panel does not get to start a
timer in a process it does not own, and three instances behind a load balancer would each
start their own.

So it is yours to schedule, wherever your application already schedules things:

```ts
import { Injectable } from "@nestjs/common";
import { PanelUploadSweep } from "@perchjs/nest";

@Injectable()
export class SweepUploads {
  constructor(private readonly sweep: PanelUploadSweep) {}

  // Nightly, on one instance. The default age is a day, which is longer than
  // any plausible gap between choosing a file and saving the form.
  async nightly(): Promise<void> {
    await this.sweep.run();
  }
}
```

It covers the common leftover and by construction cannot cover the other one: a file
committed while the row write failed sits in its final place, where no age can tell it
from one that belongs. That one is found by comparing the store against the column, or
not at all.

## A checklist

- [ ] `prisma generate` runs before the build, in the same commit's schema
- [ ] `@perchjs/ui` is installed in the image that runs
- [ ] the application is not bundled into a single file
- [ ] all seven `@perchjs/*` packages are on the same version
- [ ] the proxy forwards the full path, or the panel is mounted where the world sees it
- [ ] the proxy does not cache the pages
- [ ] something schedules the upload sweep, on one instance
- [ ] `npx perch doctor` is clean against the deployed configuration
