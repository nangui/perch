# Basic example

The smallest application that puts a Perch panel in front of you: one Nest
module, one resource, no database.

```bash
pnpm install
pnpm build
pnpm --filter @perchjs/example-basic start
```

Then open <http://localhost:3000/admin/people/create>. `PORT` overrides the port.

## What to look at

Pick a country. The **City** field is not on the page until you do — it is not
hidden, it was never sent — and the cities that appear come from `Cities`, an
ordinary Nest provider injected into the resource and called on the server while
the request is in flight.

No JavaScript was written for any of that. `src/person.resource.ts` is the whole
of it.

## Anyone can open it

This example passes no guards, because it has no authentication to plug in.
**Do not copy this module onto anything reachable.**

Perch provides no authentication of its own — every Node application already has
its own, and a login page from us would fight it. What it provides is where to
put yours, and it covers the page, the assets and the API alike:

```ts
PanelModule.forRoot({
  path: "/admin",
  resources: [PersonResource],
  guards: [YourAuthGuard],
})
```

The guard is built by the container, so it can inject whatever it needs — as
long as the module providing that is in `imports`.

## Where the rows live

In a variable — `src/memory.adapter.ts`, forty lines behind the same port a real
adapter implements. Restarting the process forgets everything, which is the
point: the panel never learns which one it got, and a real one passes
`@perchjs/prisma` instead.

Save the form and open <http://localhost:3000/admin/people/2/edit> to read it
back.

## What this example does not do

No list page yet, and no delete: those arrive with the table.
