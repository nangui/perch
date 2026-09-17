/**
 * Finding resources in a folder instead of listing them.
 *
 * Here rather than in the package because it needs files on disk that import
 * the published entry point and are loaded as modules: a fixture written in
 * TypeScript and imported from source would be testing the test runner's
 * loader rather than the thing.
 *
 * The fixtures are written under this directory, for the same reason the
 * boundary suite plants its own inside the packages: what resolves
 * `@perchjs/nest` is where it is on disk.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverResources, PanelModule } from "@perchjs/nest";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

let folder: string | undefined;

/** A directory of fixtures, inside this package so imports resolve. */
function fixtures(): string {
  mkdirSync(join(ROOT, ".discover"), { recursive: true });
  folder = mkdtempSync(join(ROOT, ".discover", "run-"));
  return folder;
}

afterEach(() => {
  if (folder !== undefined) rmSync(folder, { recursive: true, force: true });
  folder = undefined;
});

/**
 * One module, as an application would have built it.
 *
 * The decorator is applied as the function it is rather than written with `@`.
 * Decorator syntax is not JavaScript that Node will parse, and what discovery
 * loads is the built file, not the source somebody wrote.
 */
function resource(where: string, file: string, model: string, slug: string): void {
  writeFileSync(
    join(where, file),
    `import { PanelResource } from "@perchjs/nest";\n` +
      `import { Schema, TextInput } from "@perchjs/core";\n` +
      `export class ${model}Resource {\n` +
      `  form() { return Schema.make([TextInput.make("name")]); }\n` +
      `}\n` +
      `PanelResource({ model: ${JSON.stringify(model)}, slug: ${JSON.stringify(slug)} })` +
      `(${model}Resource);\n`,
    "utf8",
  );
}

const pattern = (where: string): string => `${relative(ROOT, where)}/*.resource.js`;

describe("discovering resources", () => {
  it("finds every class the pattern matches", async () => {
    const where = fixtures();
    resource(where, "post.resource.js", "Post", "posts");
    resource(where, "author.resource.js", "Author", "authors");

    const found = await discoverResources({ in: pattern(where), from: ROOT });

    expect(found.map((one) => one.name).sort()).toEqual([
      "AuthorResource",
      "PostResource",
    ]);
  });

  it("returns them in the order the paths sort", async () => {
    // Which the implementation sorts for, because Node documents no order for
    // `glob` and a navigation that depends on what a filesystem handed back is
    // one that differs between two machines.
    //
    // This pins the contract rather than catching its removal: `glob` on the
    // platforms tried here already answers in order, even for files created in
    // reverse, so taking the sort out breaks nothing that can be observed from
    // here. Kept because the guarantee is ours and not the runtime's.
    const where = fixtures();
    resource(where, "b.resource.js", "Beta", "betas");
    resource(where, "a.resource.js", "Alpha", "alphas");

    const found = await discoverResources({ in: pattern(where), from: ROOT });

    expect(found.map((one) => one.name)).toEqual(["AlphaResource", "BetaResource"]);
  });

  it("refuses a pattern that matches nothing", async () => {
    const where = fixtures();

    await expect(discoverResources({ in: pattern(where), from: ROOT })).rejects.toThrow(
      /found no files/,
    );
  });

  it("says what is usually wrong when the pattern names sources", async () => {
    // The documented example is `src/**/*.resource.ts`, and an application
    // looks for those while running the JavaScript built from them. Somebody
    // meeting an empty panel needs that sentence, not "no files matched".
    await expect(
      discoverResources({ in: "src/**/*.resource.ts", from: ROOT }),
    ).rejects.toThrow(/Node cannot load a `\.ts` file/);
  });

  it("says the same thing when a matched file will not load", async () => {
    // The ending nobody expects, and the one that actually happens: run from a
    // project root and `src/**` matches, so the failure is not an empty result
    // but a syntax error out of the loader on a line of TypeScript. The first
    // version of the advice covered only the empty case and said nothing here.
    //
    // The file below is broken rather than TypeScript, because this runner
    // loads TypeScript perfectly well and production Node does not. What is
    // exercised is the path taken when a match refuses to import under a
    // pattern that names sources; the shape it takes in an application was
    // checked by running it there.
    const where = fixtures();
    writeFileSync(join(where, "broken.resource.ts"), "export class {{{\n", "utf8");

    await expect(
      discoverResources({ in: `${relative(ROOT, where)}/*.resource.ts`, from: ROOT }),
    ).rejects.toThrow(/Node cannot load a `\.ts` file/);
  });

  it("refuses a matched file that holds no resource", async () => {
    // Quietly skipping it is how a resource goes missing from a panel and
    // nothing anywhere says why.
    const where = fixtures();
    resource(where, "post.resource.js", "Post", "posts");
    writeFileSync(
      join(where, "notes.resource.js"),
      "export const notes = 1;\n",
      "utf8",
    );

    await expect(discoverResources({ in: pattern(where), from: ROOT })).rejects.toThrow(
      /exports no @PanelResource class/,
    );
  });
});

describe("the two ways of naming resources", () => {
  it("may be used together, with one class named both ways", async () => {
    // Listing is the recommended way and finding is the other, so a class
    // named by both must not read as two resources fighting over one URL.
    const where = fixtures();
    resource(where, "post.resource.js", "Post", "posts");
    const found = await discoverResources({ in: pattern(where), from: ROOT });

    const moduleRef = await Test.createTestingModule({
      imports: [
        PanelModule.forRoot({
          path: "/admin",
          resources: [...found, ...found],
          assets: { directory: where, entries: {}, chunks: [] },
        }),
      ],
    }).compile();

    await expect(moduleRef.init()).resolves.toBeDefined();
    await moduleRef.close();
  });
});
