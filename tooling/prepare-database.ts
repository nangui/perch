/**
 * Creates the tables, once per schema.
 *
 * `prisma db push` takes its schema from the datasource URL, and creates it
 * when it is not there, so this is the same command three times with a
 * different `?schema=`. Run from `tooling/`, and needed before any suite that
 * writes to the database: without it they find no tables and say so.
 */
import { execFileSync } from "node:child_process";
import { SCHEMAS, urlFor } from "./schemas.ts";

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  console.error("DATABASE_URL is not set; there is nothing to prepare.");
  process.exit(1);
}

for (const schema of Object.values(SCHEMAS)) {
  console.log(`preparing ${schema}`);
  execFileSync("./node_modules/.bin/prisma", ["db", "push"], {
    env: { ...process.env, DATABASE_URL: urlFor(schema, url) },
    stdio: "inherit",
  });
}
