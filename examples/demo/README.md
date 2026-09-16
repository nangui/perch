# The public demo

A Perch panel over a real dataset, run the way a real application runs one:
Prisma, PostgreSQL, the representation the generator wrote. `examples/basic` is
the smallest thing that puts a panel in front of you and uses no database; this
is the other end.

Bird records, because that is what a perch is for. Four models, and each is
there to show something a panel has to do:

| Model      | What it is there for                                            |
| ---------- | --------------------------------------------------------------- |
| `Sighting` | three relations to follow, a date to filter on, a soft delete    |
| `Species`  | a badge whose colour comes from the value, a picture in a cell   |
| `Observer` | a person as one column rather than three                         |
| `Site`     | a table that is simply a table, which a demo also needs          |

## Anyone may change anything

That is the point: a visitor who cannot create, edit and delete has not seen
the panel. So the data is restored rather than protected. Every hour by
default, and `DEMO_RESET_MINUTES` sets it; `0` turns it off and leaves whatever
visitors leave behind.

`Sighting` soft-deletes, so deleting one is something to try rather than to
regret: the trashed filter finds it and **Restore** brings it back.

## Running it

```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/demo"
pnpm install
pnpm --filter @perchjs/example-demo generate
pnpm --filter "@perchjs/*" build
pnpm --filter @perchjs/example-demo exec prisma db push
pnpm --filter @perchjs/example-demo start
```

Then open <http://localhost:3000/admin>.

`prisma generate` writes two things: the Prisma client into `src/generated/client`,
which is ignored, and the Perch representation into `src/generated/ir.ts`, which
is checked in. That is why this package typechecks and builds with no database.

## In a container

```bash
docker build -f examples/demo/Dockerfile -t perch-demo .
docker run -p 3000:3000 -e DATABASE_URL="postgresql://..." perch-demo
```

Built from the repository root, because the demo depends on the framework
beside it rather than on a published version.

## What it is not

It has no authentication. Perch authenticates nobody and the demo has nobody to
authenticate: everyone who opens it is the same anonymous visitor, which is
what makes it a demo. An application puts its own guards on `forRoot`, and
[Users](../../docs/guide/users.md) says how.

`/admin` is sent to the first table by a redirect this application owns. The
panel has no route at its own mount path.
