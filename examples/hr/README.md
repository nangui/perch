# A people operations panel

The second example, and the one that asks the most of the framework: an
employee belongs to a department and reports to another employee, a time log
carries a state somebody has to move, a leave request carries a range of dates
and soft-deletes, and a salary is a `Decimal` totalled under its own column.

It is also where the CSS hooks are shown rather than described. `theme.css` is
served by the application and named in `styles: ["/theme.css"]`, so it is
linked after the panel's own sheet and outranks it without forking anything —
the panel's rules all sit in a cascade layer and this one does not.

## Running it

It needs the PostgreSQL the schema was generated against, on its own database.

```bash
# once, if the database is not there
createdb -h localhost -p 5433 hr

export DATABASE_URL="postgresql://…@localhost:5433/hr"
pnpm db:push
pnpm build
pnpm start
```

Then <http://localhost:3100/admin>. The port is in `.env` so this and the bird
example can run at once; the bird one takes 3000.

Everything is seeded at boot and put back on a schedule, so deleting a row is
something to try rather than something to regret. `DEMO_RESET_MINUTES=0` turns
the restoring off.

## What is in it

| | |
|---|---|
| `prisma/schema.prisma` | four models, and a note on what each one makes the panel do |
| `src/*.resource.ts` | one per table |
| `src/dashboard.page.ts` | the front door, which holds cards and submits nothing |
| `src/*.widget.ts` | the cards' figures, one request each |
| `src/theme.controller.ts` | the sheet that dresses it, through the published classes |
| `src/seed.ts` | the dataset, and the thing that puts it back |
