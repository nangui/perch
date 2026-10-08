# The examples

Real applications rather than fixtures. Each one is a Perch panel somebody
could have written, and each is here to make the framework answer a different
question.

| | What it is | What it asks of the panel |
|---|---|---|
| [`demo`](demo) | Bird records | Four tables, one of them soft-deleting, and a relation to follow |
| [`hr`](hr) | People operations | A self-relation, a `Decimal` totalled under its column, a state to move, a range of dates, and the CSS hooks used in anger |

## Running one

Every example needs the PostgreSQL its schema was generated against, and each
has a database of its own on the same server. The connection string is not in
git — `.env` is ignored, and `.env.example` beside it shows the shape.

```bash
cd examples/hr
cp .env.example .env          # then put the real credentials in it
createdb -h localhost -p 5433 hr
export DATABASE_URL="…"       # `prisma db push` reads the environment, not .env
pnpm db:push
pnpm build
pnpm start
```

Ports are pinned in each `.env` so more than one can run at a time: the bird
example takes 3000, this one 3100. Each seeds itself at boot and puts the data
back on a schedule, so deleting a row is something to try.

## Adding one

`examples/*` is a glob in the workspace and in the test configuration, so a new
directory needs no wiring. What it needs is its own database, its own port, and
a `.env.example` beside the `.env` git will not carry.

The quickest honest route is to copy the infrastructure — `adapter.ts`,
`prisma.module.ts`, `prisma.service.ts`, `who.ts`, `main.ts`, `tsconfig.json`,
`tsdown.config.ts`, `prisma.config.ts` — and write only the schema, the
resources, the dashboard, the widgets and the seed. That is what `hr` is.

## The two that are not here yet

Both are wanted, and both are written down so the shape is not reinvented.

### A transport reservation panel

Bookings against departures: a route, a vehicle, a departure at a time, seats
on it, and a passenger holding one. What it would ask that nothing here does:

- **A row that cannot overbook.** Seats held against seats on the vehicle is a
  rule that reads another row, which is the kind of validation the engine takes
  as a callable rather than a schema.
- **A state machine rather than a state.** Booked, boarded, missed, refunded —
  moves a reader makes from the table, which is what a row action is for.
- **Two timestamps that belong together.** A departure and an arrival, where
  the second cannot precede the first.

### A dashboard for an AI product

Usage rather than records: models, runs, tokens, cost, latency. What it would
ask:

- **Numbers that are mostly aggregates.** A page that is nearly all widgets,
  which is the case the dashboard was built for and has never been pushed on.
- **A money column in a currency with more than two decimals**, cost per
  thousand tokens being fractions of a cent — the `Decimal` path at a scale the
  HR example does not reach.
- **A table grouped by something.** `groupBy` shipped in 0.4.0 and no example
  here uses it.
