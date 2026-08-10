/**
 * `perch doctor` run as a user runs it: the real binary, over a real directory.
 *
 * `doctor.test.ts` covers the decisions; none of it proves the command reaches
 * them. Everything between — reading package.json, finding the meta file beside
 * the IR, walking the sources, the exit code a CI script reads — only exists
 * here, and is exactly the seam that has been shipped untested before.
 */
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readSchema } from "@perchjs/cli";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BINARY = join(ROOT, "packages", "cli", "dist", "index.js");

const SCHEMA = `generator client {
  provider = "prisma-client-js"
  output   = "../generated/client"
}

generator perch {
  provider = "perch-prisma-generator"
}

datasource db {
  provider = "postgresql"
}

model User {
  id Int @id @default(autoincrement())
}
`;

interface Run {
  readonly code: number;
  readonly out: string;
}

function doctor(cwd: string): Promise<Run> {
  return new Promise((done) => {
    execFile("node", [BINARY, "doctor"], { cwd }, (error, stdout, stderr) => {
      done({
        code: (error as { code?: number } | null)?.code ?? 0,
        out: `${stdout}${stderr}`,
      });
    });
  });
}

interface Options {
  readonly schema?: string;
  readonly hash?: string;
  readonly ir?: boolean;
  readonly source?: string;
  readonly manifest?: Record<string, unknown>;
}

/** A project on disk, healthy unless an option says otherwise. */
async function project(options: Options = {}): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "perch-doctor-"));
  const schema = options.schema ?? SCHEMA;

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      options.manifest ?? {
        name: "app",
        devDependencies: { prisma: "^7.9.1" },
        dependencies: { "@prisma/client": "^7.9.1" },
      },
    ),
    "utf8",
  );
  mkdirSync(join(dir, "prisma"), { recursive: true });
  writeFileSync(join(dir, "prisma", "schema.prisma"), schema, "utf8");

  if (options.ir !== false) {
    mkdirSync(join(dir, "perch"), { recursive: true });
    writeFileSync(join(dir, "perch", "ir.json"), '{"models":[]}', "utf8");
    writeFileSync(
      join(dir, "perch", "perch.meta.json"),
      JSON.stringify({
        schemaHash:
          options.hash ??
          (await readSchema(join(dir, "prisma", "schema.prisma"))).fingerprint,
      }),
      "utf8",
    );
  }

  // Nested on purpose: the walk has to recurse, which a flat src would not say.
  mkdirSync(join(dir, "src", "admin"), { recursive: true });
  writeFileSync(
    join(dir, "src", "admin", "panel.module.ts"),
    options.source ?? "PanelModule.forRoot({ path: '/admin', resources: [] })",
    "utf8",
  );
  return dir;
}

describe("a project with nothing wrong", () => {
  it("says so and exits 0", async () => {
    const { code, out } = await doctor(await project());

    expect(out).toContain("nothing to report");
    expect(code).toBe(0);
  }, 30_000);
});

describe("what only running it can catch", () => {
  it("reads the hash the generator wrote beside the IR", async () => {
    // The check that is silent otherwise: the IR is there, it parses, and it
    // describes a schema the database no longer matches.
    const { code, out } = await doctor(await project({ hash: "sha256:stale" }));

    expect(out).toContain("generated from a different schema");
    expect(code).toBe(1);
  }, 30_000);

  it("finds the IR missing where the generator would have put it", async () => {
    const { code, out } = await doctor(await project({ ir: false }));

    expect(out).toContain("No generated IR.");
    expect(code).toBe(1);
  }, 30_000);

  it("walks nested sources before deciding the panel is unwired", async () => {
    // src/admin/panel.module.ts is two levels down. A non-recursive walk finds
    // nothing there and reports a missing forRoot on a project that has one.
    const { out } = await doctor(await project());

    expect(out).not.toContain("PanelModule.forRoot");
  }, 30_000);

  it("reports the panel never being wired", async () => {
    const { code, out } = await doctor(await project({ source: "export class A {}" }));

    expect(out).toContain("No PanelModule.forRoot");
    expect(code).toBe(1);
  }, 30_000);

  it("counts a devDependency as Prisma being installed", async () => {
    // Where the CLI belongs: `prisma` is a tool, so it is normal for it to be
    // the only entry and to sit in devDependencies. Reading `dependencies`
    // alone calls that project broken.
    const { code, out } = await doctor(
      await project({
        manifest: { name: "app", devDependencies: { prisma: "^7.9.1" } },
      }),
    );

    expect(out).not.toContain("not a dependency");
    expect(code).toBe(0);
  }, 30_000);

  it("ignores a test file that names two resources", async () => {
    // The walk decides what a source is. A user's own test declaring two
    // resources is not two resources fighting over one URL, and doctor saying
    // so would fail their build over nothing.
    const dir = await project();
    writeFileSync(
      join(dir, "src", "admin", "panel.test.ts"),
      '@PanelResource({ model: "Post" })\n@PanelResource({ model: "Post" })',
      "utf8",
    );
    const { code, out } = await doctor(dir);

    expect(out).not.toContain("resources answer at");
    expect(code).toBe(0);
  }, 30_000);

  it("says where it is rather than what is missing, outside a project", async () => {
    const { code, out } = await doctor(mkdtempSync(join(tmpdir(), "perch-empty-")));

    expect(out).toContain("No package.json here.");
    expect(out).not.toContain("No schema.prisma found");
    expect(code).toBe(1);
  }, 30_000);

  it("exits 0 on a warning alone, so a warning cannot fail a build", async () => {
    const schema = SCHEMA.replace(/generator client \{[^}]*\}/s, "");
    const { code, out } = await doctor(await project({ schema }));

    expect(out).toContain("no Prisma client generator");
    expect(code).toBe(0);
  }, 30_000);
});
