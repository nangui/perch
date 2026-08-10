/**
 * That `perch doctor` and `@perchjs/prisma-generator` agree on what a schema
 * fingerprints to.
 *
 * They hold separate copies of that rule — the CLI may only import core — so
 * nothing but running both catches them drifting apart. And drift here is the
 * worst kind of failure a doctor has: it reports a stale IR on a project where
 * nothing is wrong, every run, until the user stops believing it.
 *
 * The first version of this compared the generator's hash of Prisma's
 * `datamodel` against the CLI's hash of the file. Those are not the same text:
 * Prisma hands generators its own formatted rendering, so `id Int` arrives as
 * `id    Int`, and every unformatted schema was permanently stale.
 */
import { execFile } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CLI = join(ROOT, "packages", "cli", "dist", "index.js");
const GENERATOR = join(ROOT, "packages", "prisma-generator", "dist", "generator.js");
const PRISMA = join(ROOT, "tooling", "node_modules", "prisma", "build", "index.js");

/** Deliberately unaligned: `prisma format` would change every one of these. */
const MODELS = `model Country {
  id Int @id @default(autoincrement())
  name String
  users User[]
}

model User {
  id Int @id @default(autoincrement())
  email String @unique
  countryId Int?
  country Country? @relation(fields: [countryId], references: [id])
}
`;

/**
 * `output` is resolved against the schema, so the two layouts differ. The
 * provider is the shim below rather than `node <path>`: doctor recognises the
 * generator by its published name, and a test that spelt it differently would
 * pass while telling a real user their generator is missing.
 */
const generators = (dir: string, output: string): string => `generator perch {
  provider = "${join(dir, "node_modules", ".bin", "perch-prisma-generator")}"
  output   = "${output}"
}

datasource db {
  provider = "postgresql"
}
`;

function run(
  command: readonly string[],
  cwd: string,
): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    execFile("node", [...command], { cwd }, (error, stdout, stderr) => {
      done({
        code: (error as { code?: number } | null)?.code ?? 0,
        out: `${stdout}${stderr}`,
      });
    });
  });
}

/** A project whose schema is one file, or a directory of them. */
function project(split: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), "perch-fingerprint-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "app", devDependencies: { prisma: "^7.9.1" } }),
    "utf8",
  );
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "app.module.ts"), "PanelModule.forRoot({})", "utf8");

  // What `pnpm add` would have put there, pointing at the build under test.
  mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
  const shim = join(dir, "node_modules", ".bin", "perch-prisma-generator");
  writeFileSync(shim, `#!/bin/sh\nexec node "${GENERATOR}" "$@"\n`, "utf8");
  chmodSync(shim, 0o755);

  if (split) {
    // Prisma 7 takes a directory too, and then hands the generator every file
    // concatenated. A doctor that only knows `prisma/schema.prisma` reports it
    // missing on a project that is perfectly set up.
    mkdirSync(join(dir, "prisma", "schema"), { recursive: true });
    writeFileSync(
      join(dir, "prisma", "schema", "config.prisma"),
      generators(dir, "../../perch"),
      "utf8",
    );
    writeFileSync(join(dir, "prisma", "schema", "models.prisma"), MODELS, "utf8");
  } else {
    mkdirSync(join(dir, "prisma"), { recursive: true });
    writeFileSync(
      join(dir, "prisma", "schema.prisma"),
      `${generators(dir, "../perch")}\n${MODELS}`,
      "utf8",
    );
  }
  return dir;
}

describe("the Prisma version the two agree on", () => {
  it("is one fact, not two", async () => {
    // The generator refuses a major it has not been read against; doctor warns
    // about the same one. Separate constants in separate packages, so nothing
    // but this notices one being bumped without the other.
    const { readFile } = await import("node:fs/promises");
    const reader = await readFile(
      join(ROOT, "packages", "prisma-generator", "src", "dmmf-reader.ts"),
      "utf8",
    );
    const doctor = await readFile(
      join(ROOT, "packages", "cli", "src", "doctor.ts"),
      "utf8",
    );

    const range = /SUPPORTED_PRISMA_RANGE\s*=\s*"([^"]+)"/.exec(reader)?.[1];
    const major = /SUPPORTED_PRISMA_MAJOR\s*=\s*(\d+)/.exec(doctor)?.[1];

    expect(range).toBeDefined();
    expect(major).toBeDefined();
    expect(range).toBe(`>=${major ?? ""}.0.0 <${String(Number(major) + 1)}.0.0`);
  });
});

describe.each([
  ["one schema file", false, "./prisma/schema.prisma"],
  ["a directory of schema files", true, "./prisma/schema"],
])("%s", (_name, split, schemaArg) => {
  it("generates, then reports nothing", async () => {
    const dir = project(split);

    const generated = await run([PRISMA, "generate", "--schema", schemaArg], dir);
    expect(generated.out).toContain("Generated");

    // The whole point: the generator wrote a fingerprint the CLI recomputes to
    // the same value, over a schema neither of them formatted.
    const checked = await run([CLI, "doctor", "--ir", "./perch/ir.json"], dir);

    expect(checked.out).not.toContain("different schema");
    expect(checked.out).not.toContain("No schema.prisma found");
    expect(checked.code).toBe(0);
  }, 120_000);

  it("notices the schema changing after the IR was generated", async () => {
    const dir = project(split);
    await run([PRISMA, "generate", "--schema", schemaArg], dir);

    const grown = `${MODELS}\nmodel Tag {\n  id Int @id\n}\n`;
    if (split) {
      writeFileSync(join(dir, "prisma", "schema", "models.prisma"), grown, "utf8");
    } else {
      writeFileSync(
        join(dir, "prisma", "schema.prisma"),
        `${generators(dir, "../perch")}\n${grown}`,
        "utf8",
      );
    }

    const checked = await run([CLI, "doctor", "--ir", "./perch/ir.json"], dir);

    expect(checked.out).toContain("different schema");
    expect(checked.code).toBe(1);
  }, 120_000);
});
