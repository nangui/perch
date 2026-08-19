/**
 * The contract test, finally pointed at a DMMF Prisma really produced.
 *
 * It runs `prisma generate` over the fixture schema and compares the IR that
 * comes back with the one the hand-written DMMF produces. Two things fail here
 * and nowhere else: a Prisma release changing the shape the reader depends on,
 * and the fixture drifting away from what Prisma emits.
 *
 * It runs against `dist/`, so `pnpm build` has to have happened — which is why
 * ci.yml builds before it tests.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import type { Ir } from "@perchjs/core";
import { FIXTURE_DMMF } from "./__fixtures__/dmmf.js";
import { readDmmf } from "./dmmf-reader.js";

const run = promisify(execFile);
const PACKAGE = dirname(dirname(fileURLToPath(import.meta.url)));
const EMITTED = join(PACKAGE, ".contract", "ir.ts");

let generated: Ir;

beforeAll(async () => {
  if (!existsSync(join(PACKAGE, "dist", "generator.js"))) {
    throw new Error("run `pnpm build` first: this test runs the built generator.");
  }
  await rm(join(PACKAGE, ".contract"), { recursive: true, force: true });
  await run("./node_modules/.bin/prisma", ["generate"], { cwd: PACKAGE });

  generated = ((await import(pathToFileURL(EMITTED).href)) as { IR: Ir }).IR;
}, 120_000);

describe("the DMMF Prisma really emits", () => {
  it("produces the same IR as the hand-written fixture", () => {
    // One assertion on the whole thing on purpose: a per-field check would pass
    // while Prisma quietly added or dropped a model.
    expect(generated).toEqual(readDmmf(FIXTURE_DMMF));
  });

  it("carries what the IR is made of, not just names and types", () => {
    // The failure this whole generator exists for: Prisma 7 stripped the DMMF to
    // name/kind/type. Asserting a few of the survivors names the loss directly.
    const user = generated.models.find((model) => model.name === "User");
    const email = user?.fields.find((field) => field.name === "email");

    expect(user?.dbName).toBe("users");
    expect(user?.documentation).toBe("Someone who can sign in.");
    expect(email).toMatchObject({
      isUnique: true,
      isRequired: true,
      maxLength: 255,
      documentation: "Used to sign in. Must be unique.",
    });
    expect(user?.fields.find((field) => field.name === "role")?.enumValues).toEqual([
      "ADMIN",
      "EDITOR",
      "VIEWER",
    ]);
  });

  it("emits the same IR as JSON, for a reader that is not TypeScript", async () => {
    // `@perchjs/cli` is a plain Node binary: it cannot import the module above,
    // and parsing the literal back out of it would be string surgery.
    const beside = JSON.parse(
      await readFile(join(PACKAGE, ".contract", "ir.json"), "utf8"),
    ) as Ir;

    expect(beside).toEqual(generated);
  });

  it("emits a file that names its own type", async () => {
    // Unannotated, a malformed IR would only surface at the consumer's first
    // query. The annotation cannot be exercised here — @perchjs/prisma is not a
    // dependency of this package and must not become one — so what is checked
    // is that the emitter still writes it.
    const source = await readFile(EMITTED, "utf8");

    expect(source).toContain('import type { Ir } from "@perchjs/prisma";');
    expect(source).toContain("export const IR: Ir = {");
  });
});
