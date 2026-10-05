/**
 * The adapter that ships, against the contract the package publishes.
 *
 * `checkDataAdapter` is run in this repository by the suite that wrote it and
 * by the example's in-memory adapter. Neither is what anybody installs. The
 * Prisma adapter is, and it had never been asked the questions the contract
 * asks — which is how the example's adapter came to have `not` doing the
 * opposite of what it says, and an include accepted and ignored.
 *
 * Skips without a database, like every other suite here that needs one, and CI
 * gives it one.
 *
 * Two models, because the schema settles it rather than a preference. `Country`
 * marks rather than destroys and is where deleting is asked about; its name is
 * unique, so the three rows cannot be tied on it and are tied on the tombstone
 * they all leave empty. `Author` has two text columns, which is what a search
 * needs to be asked whether it stayed in the one it was given.
 *
 * Relations are not asked about. The contract wants a relation whose join table
 * belongs to neither model, and this schema has none: every relation here is a
 * foreign key on one side. Adding one would change what the other suites
 * generate from, which is a decision rather than a line.
 */
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { SCHEMAS } from "./schemas.ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataAdapter, Ir } from "@perchjs/core";
import { PrismaDataAdapter } from "@perchjs/prisma";
import { checkDataAdapter } from "@perchjs/testing";

const DATABASE_URL = process.env["DATABASE_URL"];

let pool: pg.Pool;
let client: { $disconnect: () => Promise<void> };
let adapter: DataAdapter;

beforeAll(async () => {
  if (DATABASE_URL === undefined) return;

  pool = new pg.Pool({ connectionString: DATABASE_URL });
  // Imported here rather than at the top: `.generated/` is a build output, and
  // a static import would break this file for anyone who has never run the
  // generator, including when it is meant to skip.
  const { PrismaClient } = (await import("./.generated/client/index.js")) as {
    PrismaClient: new (options: unknown) => { $disconnect: () => Promise<void> };
  };
  const { IR } = (await import("./.generated/ir.ts")) as { IR: Ir };

  client = new PrismaClient({
    adapter: new PrismaPg(pool, { schema: SCHEMAS.contract }),
  });
  adapter = new PrismaDataAdapter({ client: client as never, ir: IR });
}, 120_000);

afterAll(async () => {
  // Assigned together or not at all: `beforeAll` returns before either where
  // there is no database, and this whole describe is skipped then.
  if (DATABASE_URL === undefined) return;
  await client.$disconnect();
  await pool.end();
});

/** Unique per run, because the contract leaves its rows behind. */
const mark = (): string =>
  `contract-${String(Date.now())}-${String(Math.random()).slice(2, 7)}`;

describe.skipIf(DATABASE_URL === undefined)("the adapter that ships", () => {
  it("keeps the contract on a model that marks", async () => {
    const run = mark();

    expect(
      await checkDataAdapter(adapter, {
        model: "Country",
        // Three names, because the column is unique and three rows cannot share
        // one. Tied on the tombstone instead, which all three leave empty.
        rows: [
          // Amounts whose total a double gets wrong, so the contract's
          // decimal check is asking something rather than agreeing with
          // whatever arithmetic the adapter happened to do.
          { set: { name: `${run}-alpha`, amount: "10.01" } },
          { set: { name: `${run}-beta`, amount: "20.02" } },
          { set: { name: `${run}-gamma`, amount: "0.07" } },
        ],
        tiedOn: "deletedAt",
        filterOn: { path: "name", value: `${run}-alpha`, absent: `${run}-nowhere` },
      }),
    ).toEqual([]);
  }, 120_000);

  it("keeps the contract where a search has somewhere else to look", async () => {
    const run = mark();

    expect(
      await checkDataAdapter(adapter, {
        model: "Author",
        rows: [
          { set: { name: `${run}-ada`, email: `${run}-1@example.test` } },
          { set: { name: `${run}-ada`, email: `${run}-2@example.test` } },
          { set: { name: `${run}-ada`, email: `${run}-3@example.test` } },
        ],
        tiedOn: "name",
        filterOn: { path: "name", value: `${run}-ada`, absent: `${run}-nobody` },
        // The term is in the name and not in the address, so a search told to
        // look at the address and finding it anyway is looking everywhere.
        searchOn: { term: `${run}-ada`, reaching: "name", notReaching: "email" },
      }),
    ).toEqual([]);
  }, 120_000);
});
