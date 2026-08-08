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

There is no authentication here, and `PanelModule.forRoot` does not yet take the
`guards` option the design calls for. **Do not copy this module onto anything
reachable.**

Nest's own mechanism does work in the meantime, and covers every panel route —
the page, the assets and the API. Verified with a guard that refuses everything:
all three answer 403.

```ts
@Module({
  imports: [PanelModule.forRoot({ … })],
  providers: [{ provide: APP_GUARD, useClass: YourAuthGuard }],
})
```

## What this example does not do

Nothing is persisted. There is no `DataAdapter` behind the form yet, so the
Create page renders and answers but saves nothing. Listing, editing and deleting
come with it.
