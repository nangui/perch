---
"@perchjs/cli": minor
---

Add `perch panel`, which wires a panel into an existing Nest application.

It writes `src/admin/admin.module.ts` and `src/admin/panel-data.ts`, and adds
`AdminModule` to the root module's imports. Nothing is written until `--write`:
without it the command prints the files and the edit it would make, which is
the mitigation the design names for a command that edits code somebody else
wrote.

The Prisma client is not constructed. Prisma 7 takes its connection through a
driver adapter and its URL out of the schema, so only the application can build
one — `perch panel` finds the class that already **is** one (`extends
PrismaClient`) and injects that, along with the module exporting it so the
container can resolve it. A class that merely holds a client in a property is
not injected: the adapter reads delegates off whatever it is given, so that one
would compile and then fail at the first query. It is named in the output
instead, so you know which property to hand over.

Otherwise the generated adapter takes a client through `PANEL_PRISMA_CLIENT`.

A root module it cannot edit without guessing — more than one `@Module`, or an
`imports` that is not an array literal — is left untouched, and the two lines to
add are printed instead.

`perch doctor` now names this command when it finds no `PanelModule.forRoot`.
