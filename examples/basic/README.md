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

## What this example does not do

Nothing is persisted. There is no `DataAdapter` behind the form yet, so the
Create page renders and answers but saves nothing. Listing, editing and deleting
come with it.
