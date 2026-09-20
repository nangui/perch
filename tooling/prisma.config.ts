// The integration schema. `db push` needs the connection URL, which Prisma 7
// takes from here rather than from the schema. `generate` does not: it writes
// a client from the schema and never opens a connection.
//
// So the URL falls back rather than being required. Demanding it made
// `prisma generate` impossible without a database, and the files it writes are
// ignored by git, as generated code should be. Between the two, typechecking
// this package needed a PostgreSQL: on a fresh checkout the suites that import
// the client had nothing to import, and CI said so four times.
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url:
      process.env["DATABASE_URL"] ??
      "postgresql://generate-does-not-connect/placeholder",
  },
});
