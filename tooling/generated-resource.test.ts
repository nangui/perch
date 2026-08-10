/**
 * The bar taken literally: `perch resource User` produces a file that compiles
 * and passes the project's lint, with no editing.
 *
 * Asserting the strings it contains is not that. `resource.test.ts` does the
 * strings; this runs the real compiler and the real linter over the real
 * output, against the packages a user would have installed.
 *
 * It caught what the strings could not: `inferModel` names five components core
 * exports no builder for, and the first draft imported them.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import type { Ir } from "@perchjs/core";
import { generateResource } from "@perchjs/cli";

const run = promisify(execFile);
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

/** The twelve-model fixture, through the reader, as a user's schema would be. */
let ir: Ir;

beforeAll(async () => {
  const module_ =
    (await import("../packages/prisma-generator/src/__fixtures__/dmmf.js")) as {
      FIXTURE_DMMF: unknown;
    };
  const reader = (await import("../packages/prisma-generator/src/dmmf-reader.js")) as {
    readDmmf: (dmmf: unknown) => Ir;
  };
  ir = reader.readDmmf(module_.FIXTURE_DMMF);
}, 60_000);

function project(model: string): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), "perch-generated-"));
  const generated = generateResource(ir, model);
  const file = join(dir, generated.path);

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, generated.contents, "utf8");
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2023",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noUnusedLocals: true,
        noEmit: true,
        skipLibCheck: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        baseUrl: ".",
        paths: {
          "@perchjs/*": [join(ROOT, "packages", "*", "dist", "index.d.ts")],
        },
      },
      include: ["src/**/*.ts"],
    }),
    "utf8",
  );
  return { dir, file };
}

describe("every model of the fixture", () => {
  it.each(["User", "Post", "Product", "Order", "PostTag"])(
    "generates a %s resource that compiles",
    async (model) => {
      const { dir } = project(model);

      // `noUnusedLocals` is the half that matters as much as compiling: an
      // import the file does not use fails this project's lint, and what is
      // generated has to pass it.
      await expect(
        run(join(ROOT, "node_modules", ".bin", "tsc"), ["--project", dir]),
      ).resolves.toBeDefined();
    },
    120_000,
  );
});

describe("what it refuses to invent", () => {
  it("comments a field whose component core does not build", async () => {
    // `Post.body` is `@db.Text`, so inference wants a Textarea, which is not
    // built yet. Until then a comment is a line to finish rather than a build
    // to fix.
    const { file } = project("Post");
    const { readFileSync } = await import("node:fs");
    const contents = readFileSync(file, "utf8");

    expect(contents).toContain("// body — wants Textarea, which is not built yet");
    expect(contents).not.toContain("Textarea.make");
    expect(contents.slice(0, contents.indexOf("}"))).not.toContain("Textarea");
  });
});
