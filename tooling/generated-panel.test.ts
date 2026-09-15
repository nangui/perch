/**
 * `perch panel` taken literally: it shows what it would do, and what it writes
 * when told to compiles.
 *
 * The unit tests cover what it decides. None of that proves the two files it
 * emits are valid TypeScript against the packages a user actually installs —
 * and a generated module that does not compile is worth nothing. This runs the
 * real generator, the real binary and the real compiler over a real project.
 */
import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CLI = join(ROOT, "packages", "cli", "dist", "index.js");
const GENERATOR = join(ROOT, "packages", "prisma-generator", "dist", "generator.js");
const PRISMA = join(ROOT, "tooling", "node_modules", "prisma", "build", "index.js");
const TSC = join(ROOT, "node_modules", ".bin", "tsc");

const SCHEMA = `generator perch {
  provider = "PROVIDER"
  output   = "../perch"
}

datasource db {
  provider = "postgresql"
}

model User {
  id Int @id @default(autoincrement())
  email String @unique
  name String?
}
`;

const APP_MODULE = `import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  imports: [PrismaModule],
})
export class AppModule {}
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

/** `.bin/tsc` is a shell wrapper, so it is run directly rather than under node. */
function typecheck(cwd: string): Promise<{ code: number; out: string }> {
  return new Promise((done) => {
    execFile(TSC, ["--project", cwd], { cwd }, (error, stdout, stderr) => {
      done({
        code: (error as { code?: number } | null)?.code ?? 0,
        out: `${stdout}${stderr}`,
      });
    });
  });
}

/** A Nest application with a Prisma service, as a user would have it. */
function project(withClient = true): string {
  const dir = mkdtempSync(join(tmpdir(), "perch-panel-"));
  const shim = join(dir, "node_modules", ".bin", "perch-prisma-generator");

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "app", devDependencies: { prisma: "^7.9.1" } }),
    "utf8",
  );
  mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
  writeFileSync(shim, `#!/bin/sh\nexec node "${GENERATOR}" "$@"\n`, { mode: 0o755 });

  mkdirSync(join(dir, "prisma"), { recursive: true });
  writeFileSync(
    join(dir, "prisma", "schema.prisma"),
    SCHEMA.replace("PROVIDER", shim),
    "utf8",
  );

  mkdirSync(join(dir, "src", "prisma"), { recursive: true });
  writeFileSync(join(dir, "src", "app.module.ts"), APP_MODULE, "utf8");

  if (withClient) {
    // Stands in for the generated client, which needs a database to produce.
    writeFileSync(
      join(dir, "src", "prisma", "prisma.service.ts"),
      `export declare class PrismaClient {
  $transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
  [delegate: string]: unknown;
}

export class PrismaService extends PrismaClient {}
`,
      "utf8",
    );
    writeFileSync(
      join(dir, "src", "prisma", "prisma.module.ts"),
      `import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
`,
      "utf8",
    );
  }

  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2023",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        baseUrl: ".",
        paths: {
          "@perchjs/*": [join(ROOT, "packages", "*", "dist", "index.d.ts")],
          // pnpm keeps no @nestjs at the workspace root; the panel package has
          // the copy a consumer of it would resolve.
          "@nestjs/*": [join(ROOT, "packages", "nest", "node_modules", "@nestjs", "*")],
        },
      },
      include: ["src/**/*.ts", "perch/**/*.ts"],
    }),
    "utf8",
  );
  return dir;
}

let generated: string;

beforeAll(async () => {
  generated = project();
  const result = await run(
    [PRISMA, "generate", "--schema", "./prisma/schema.prisma"],
    generated,
  );
  expect(result.out).toContain("Generated");
}, 120_000);

describe("without --write", () => {
  it("shows the files and the edit, and touches nothing", async () => {
    const { code, out } = await run([CLI, "panel"], generated);

    expect(out).toContain("src/admin/admin.module.ts");
    expect(out).toContain("src/admin/panel-data.ts");
    expect(out).toContain("add AdminModule to its imports");
    expect(out).toContain("Re-run with --write");
    expect(code).toBe(0);

    // The whole point of a dry run.
    expect(existsSync(join(generated, "src", "admin", "admin.module.ts"))).toBe(false);
    expect(readFileSync(join(generated, "src", "app.module.ts"), "utf8")).toBe(
      APP_MODULE,
    );
  }, 30_000);
});

describe("with --write", () => {
  it("writes both files and registers the module", async () => {
    const { code, out } = await run([CLI, "panel", "--write"], generated);
    const app = readFileSync(join(generated, "src", "app.module.ts"), "utf8");

    expect(out).toContain("registered AdminModule");
    expect(out).toContain("your panel is at /admin");
    expect(code).toBe(0);
    expect(app).toContain('import { AdminModule } from "./admin/admin.module.js";');
    expect(app).toContain("imports: [AdminModule, PrismaModule]");
  }, 30_000);

  it("wires the service the application already had", () => {
    const data = readFileSync(join(generated, "src", "admin", "panel-data.ts"), "utf8");
    const admin = readFileSync(
      join(generated, "src", "admin", "admin.module.ts"),
      "utf8",
    );

    expect(data).toContain("constructor(client: PrismaService)");
    expect(admin).toContain("imports: [PrismaModule]");
  });

  it("produces something that compiles", async () => {
    // The bar the resource generator is held to, applied here.
    const { code, out } = await typecheck(generated);

    expect(out).toBe("");
    expect(code).toBe(0);
  }, 120_000);

  it("refuses to overwrite what is already there", async () => {
    const { code, out } = await run([CLI, "panel", "--write"], generated);

    expect(out).toContain("is already there");
    expect(code).toBe(1);
  }, 30_000);

  it("does not tell you to add a line you already have", async () => {
    // Re-run with --force: the files are rewritten, and the root module is
    // already registered. Printing the paste instructions there would be
    // telling somebody to add what they added a minute ago.
    const { code, out } = await run([CLI, "panel", "--write", "--force"], generated);

    expect(out).toContain("already in your root module");
    expect(out).not.toContain("Add this to your root module yourself");
    expect(code).toBe(0);
  }, 30_000);

  it("picks the same client on a second run", async () => {
    // The walk has no order of its own, and its own output is now in the tree.
    const app = readFileSync(join(generated, "src", "admin", "panel-data.ts"), "utf8");
    await run([CLI, "panel", "--write", "--force"], generated);

    expect(readFileSync(join(generated, "src", "admin", "panel-data.ts"), "utf8")).toBe(
      app,
    );
  }, 30_000);
});

describe("the whole path, with no editing", () => {
  it("panel, then resource, and the resource is on the panel", async () => {
    // What the design calls time-to-first-CRUD: two commands and a running
    // panel. A resource the module does not name is a file nobody reads, so
    // this is the assertion that the path has no hand-edit left in it.
    const dir = project();
    await run([PRISMA, "generate", "--schema", "./prisma/schema.prisma"], dir);
    await run([CLI, "panel", "--write"], dir);

    const { code, out } = await run([CLI, "resource", "User"], dir);
    const module_ = readFileSync(join(dir, "src", "admin", "admin.module.ts"), "utf8");

    expect(code).toBe(0);
    expect(out).toContain("added UserResource to src/admin/admin.module.ts");
    expect(module_).toContain(
      'import { UserResource } from "./resources/user.resource.js";',
    );
    expect(module_).toContain("resources: [UserResource]");

    // And all three files still compile together.
    const compiled = await typecheck(dir);
    expect(compiled.out).toBe("");
    expect(compiled.code).toBe(0);
  }, 180_000);

  it("says so rather than repeating itself on a second run", async () => {
    const dir = project();
    await run([PRISMA, "generate", "--schema", "./prisma/schema.prisma"], dir);
    await run([CLI, "panel", "--write"], dir);
    await run([CLI, "resource", "User"], dir);

    const { out } = await run([CLI, "resource", "User", "--force"], dir);
    const module_ = readFileSync(join(dir, "src", "admin", "admin.module.ts"), "utf8");

    expect(out).toContain("already on the panel");
    expect(module_.match(/UserResource/g)).toHaveLength(2);
  }, 180_000);

  it("points at perch panel when there is no module to add it to", async () => {
    const dir = project();
    await run([PRISMA, "generate", "--schema", "./prisma/schema.prisma"], dir);

    const { code, out } = await run([CLI, "resource", "User"], dir);

    expect(code).toBe(0);
    expect(out).toContain("perch panel");
  }, 120_000);
});

describe("an application whose class only holds a client", () => {
  it("says which one, rather than claiming there is none", async () => {
    // Telling somebody with a PrismaService that no client was found is a lie,
    // and the useful half is which property to hand over.
    const dir = project(false);
    writeFileSync(
      join(dir, "src", "prisma", "prisma.service.ts"),
      `export declare class PrismaClient {
  $transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
  [delegate: string]: unknown;
}

export class Database {
  constructor(readonly client: PrismaClient) {}
}
`,
      "utf8",
    );
    writeFileSync(
      join(dir, "src", "prisma", "prisma.module.ts"),
      `import { Module } from "@nestjs/common";
import { Database } from "./prisma.service.js";

@Module({ providers: [Database], exports: [Database] })
export class PrismaModule {}
`,
      "utf8",
    );
    await run([PRISMA, "generate", "--schema", "./prisma/schema.prisma"], dir);

    const { out } = await run([CLI, "panel", "--write"], dir);

    expect(out).toContain("Database holds a PrismaClient but is not one");
    expect(readFileSync(join(dir, "src", "admin", "panel-data.ts"), "utf8")).toContain(
      "PANEL_PRISMA_CLIENT",
    );

    const { code, out: errors } = await typecheck(dir);
    expect(errors).toBe("");
    expect(code).toBe(0);
  }, 120_000);
});

describe("an application with no Prisma client of its own", () => {
  it("takes one through a token, and still compiles", async () => {
    const dir = project(false);
    writeFileSync(
      join(dir, "src", "app.module.ts"),
      `import { Module } from "@nestjs/common";\n\n@Module({})\nexport class AppModule {}\n`,
      "utf8",
    );
    await run([PRISMA, "generate", "--schema", "./prisma/schema.prisma"], dir);

    const written = await run([CLI, "panel", "--write"], dir);
    expect(written.out).toContain("No Prisma client was found in your sources");

    const data = readFileSync(join(dir, "src", "admin", "panel-data.ts"), "utf8");
    expect(data).toContain("PANEL_PRISMA_CLIENT");

    const { code, out } = await typecheck(dir);

    expect(out).toBe("");
    expect(code).toBe(0);
  }, 120_000);
});
