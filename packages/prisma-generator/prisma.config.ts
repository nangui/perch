// Prisma 7 no longer takes the schema path from a convention, so the CLI needs
// this to find one. No datasource URL: nothing here connects to a database —
// generating the IR is a compile-time read of the schema.
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
});
