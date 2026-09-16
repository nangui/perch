// `db push` and the generators need the connection URL, which Prisma 7 takes
// from here rather than from the schema.
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: env("DATABASE_URL") },
});
