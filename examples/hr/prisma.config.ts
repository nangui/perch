// `db push` needs the connection URL, which Prisma 7 takes from here rather
// than from the schema. `generate` does not: it writes a client from the
// schema and never opens a connection.
//
// So the URL falls back rather than being required. Demanding it made
// `prisma generate` impossible without a database, which made the build
// impossible without one, which is how this package went to CI unable to
// build at all: the generated client is ignored by git, as generated code
// should be, so a fresh checkout had nothing to import.
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url:
      process.env["DATABASE_URL"] ??
      "postgresql://generate-does-not-connect/placeholder",
  },
});
