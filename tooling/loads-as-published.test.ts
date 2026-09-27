/**
 * Every package loads the way it says it can be loaded.
 *
 * `publint` reads the manifests and `attw` resolves the types. Neither runs
 * anything. So a package can declare a `require` condition, point it at a bundle
 * that requires something only importable, and pass both — and the reader finds
 * out at their first boot. Four of these declare one, and the adapter's CJS
 * bundle requires the platform it takes as a peer, which is exactly the shape
 * that breaks the day that peer ships as ESM only.
 *
 * Loaded from a directory that is not this repository. A reader resolves
 * `@perchjs/nest` through their own `node_modules` and the package's exports
 * map, and a test importing it by relative path exercises neither. The directory
 * holds a link per package, which is what a store leaves behind anyway, and node
 * resolves each package's own dependencies from where it really lives.
 *
 * Both directions are asserted, because only one of them is about a bug. A
 * package that stops honouring a `require` it declares is broken for whoever
 * required it; one that refuses a `require` it never declared is its exports map
 * working, and the day that refusal stops arriving is the day a bundle nobody
 * meant to publish for CommonJS is being loaded as CommonJS.
 */
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

interface Published {
  readonly name: string;
  readonly folder: string;
  /** Whether its exports map offers a `require` at all. */
  readonly required: boolean;
}

function published(): Published[] {
  const packages = join(ROOT, "packages");
  return readdirSync(packages, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((folder) => ({
      folder,
      manifest: JSON.parse(
        readFileSync(join(packages, folder, "package.json"), "utf8"),
      ) as { name: string; private?: boolean; exports?: Record<string, unknown> },
    }))
    .filter(({ manifest }) => manifest.private !== true)
    .map(({ folder, manifest }) => {
      const main = manifest.exports?.["."];
      return {
        folder,
        name: manifest.name,
        required: typeof main === "object" && main !== null && "require" in main,
      };
    });
}

let consumer = "";

beforeAll(() => {
  consumer = mkdtempSync(join(tmpdir(), "perch-consumer-"));
  const modules = join(consumer, "node_modules", "@perchjs");
  mkdirSync(modules, { recursive: true });
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "reader", private: true, version: "1.0.0" }),
    "utf8",
  );
  for (const { name, folder } of published()) {
    symlinkSync(
      join(ROOT, "packages", folder),
      join(modules, name.split("/")[1] ?? folder),
    );
  }
});

afterAll(() => {
  rmSync(consumer, { recursive: true, force: true });
});

/** What node said, or nothing at all when it loaded. */
function load(name: string, how: "require" | "import"): string | undefined {
  const argv =
    how === "require"
      ? ["-e", `require(${JSON.stringify(name)})`]
      : ["--input-type=module", "-e", `await import(${JSON.stringify(name)})`];
  try {
    execFileSync(process.execPath, argv, { cwd: consumer, stdio: "pipe" });
    return undefined;
  } catch (error) {
    const said = (error as { stderr?: Buffer }).stderr;
    return String(said ?? "no stderr").trim();
  }
}

describe.each(published())("$name", ({ name, required }) => {
  it("is importable", () => {
    expect(load(name, "import"), `import() failed`).toBeUndefined();
  });

  it(
    required
      ? "loads through the require it offers"
      : "offers no require, and refuses one",
    () => {
      const said = load(name, "require");
      if (required) {
        expect(
          said,
          "declares a require condition and does not load through it",
        ).toBeUndefined();
        return;
      }
      expect(
        said ?? "it loaded",
        "declares no require condition, so require() has to be refused by the exports map",
      ).toContain("ERR_PACKAGE_PATH_NOT_EXPORTED");
    },
  );
});
